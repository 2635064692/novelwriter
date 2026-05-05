import { useEffect, useMemo, useRef, useState } from 'react'
import '@/lib/uiMessagePacks/novel'
import { cn } from '@/lib/utils'
import { streamOutlineGeneration } from '@/services/api'
import { Button } from '@/components/ui/button'
import { useUiLocale } from '@/contexts/UiLocaleContext'
import { useOutlineState, useApproveOutline } from '@/hooks/world/useOutline'
import { useToast } from '@/components/world-model/shared/useToast'
import { useQueryClient } from '@tanstack/react-query'
import { worldKeys } from '@/hooks/world/keys'
import { OutlineControls } from './outline/OutlineControls'
import { ActivityPanel, SummaryBar, VolumeDetail, VolumeList } from './outline/OutlinePanels'
import { activityForEvent, appendActivityItem, chapterFromEvent, outlineErrorMessage, outlineEventErrorMessage, parsePositiveInt, upsertChapter, upsertVolume, volumeFromEvent } from './outline/utils'
import type { ActivityItem, ScopeTab, StreamPhase, Translate } from './outline/types'
import type { OutlineGenerateRequest, OutlineStreamEvent, OutlineVolume } from '@/types/api'

function DialogHeader({ isStreaming, onStop, onClose, t }: { isStreaming: boolean; onStop: () => void; onClose: () => void; t: Translate }) {
  return (
    <div className='flex items-center justify-between border-b border-[var(--nw-glass-border)] px-5 py-4'>
      <div className='space-y-1'>
        <div className='text-sm font-semibold text-foreground'>{t('worldModel.outline.title')}</div>
        <div className='text-xs text-muted-foreground'>{t('worldModel.outline.description')}</div>
      </div>
      <div className='flex items-center gap-2'>
        {isStreaming ? (
          <Button type='button' size='sm' variant='outline' className='h-8 border-[var(--nw-glass-border)] bg-transparent hover:bg-[var(--nw-glass-bg-hover)]' onClick={onStop}>
            {t('worldModel.outline.stop')}
          </Button>
        ) : null}
        <Button type='button' size='sm' variant='outline' className='h-8 border-[var(--nw-glass-border)] bg-transparent hover:bg-[var(--nw-glass-bg-hover)]' onClick={onClose}>
          {t('dialog.cancel')}
        </Button>
      </div>
    </div>
  )
}

export function OutlineManagementDialog({ novelId, open, onOpenChange }: { novelId: number; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { locale, t } = useUiLocale()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const { data: outlineState, isLoading, refetch } = useOutlineState(novelId, open)
  const approveOutline = useApproveOutline(novelId)
  const [tab, setTab] = useState<ScopeTab>('volumes')
  const [totalVolumesHint, setTotalVolumesHint] = useState('')
  const [batchSize, setBatchSize] = useState('25')
  const [guidance, setGuidance] = useState('')
  const [selectedVolume, setSelectedVolume] = useState<number | null>(null)
  const [streamError, setStreamError] = useState<string | null>(null)
  const [streamPhase, setStreamPhase] = useState<StreamPhase>(null)
  const [streamVolumes, setStreamVolumes] = useState<OutlineVolume[] | null>(null)
  const [activity, setActivity] = useState<ActivityItem[]>([])
  const controllerRef = useRef<AbortController | null>(null)

  const baseVolumes = useMemo(() => outlineState?.systems.map(system => system.data).sort((left, right) => left.volume_number - right.volume_number) ?? [], [outlineState])
  const volumes: OutlineVolume[] = streamVolumes ?? baseVolumes
  const selected = useMemo(() => volumes.find(volume => volume.volume_number === selectedVolume) ?? volumes[0] ?? null, [volumes, selectedVolume])
  const selectedSystem = useMemo(() => outlineState?.systems.find(system => system.data.volume_number === selected?.volume_number) ?? null, [outlineState, selected])
  const systemStatusLabel = outlineState?.systems.length
    ? t(outlineState.systems.every(system => system.status === 'confirmed') ? 'worldModel.common.statusConfirmed' : 'worldModel.common.statusDraft')
    : t('worldModel.common.none')
  const isStreaming = streamPhase !== null

  useEffect(() => {
    if (!open) return
    setStreamError(null)
    setStreamPhase(null)
    setStreamVolumes(null)
    setActivity([])
  }, [open])

  useEffect(() => {
    if (!open) return
    const firstVolume = volumes[0]?.volume_number ?? null
    if (selectedVolume === null || !volumes.some(volume => volume.volume_number === selectedVolume)) {
      setSelectedVolume(firstVolume)
    }
  }, [open, selectedVolume, volumes])

  useEffect(() => {
    if (open) return
    controllerRef.current?.abort()
    controllerRef.current = null
    setStreamPhase(null)
  }, [open])

  const appendActivity = (tone: ActivityItem['tone'], text: string) => {
    setActivity(prev => appendActivityItem(prev, tone, text))
  }

  const invalidateOutline = async () => {
    await queryClient.invalidateQueries({ queryKey: worldKeys.outlineState(novelId) })
    await queryClient.invalidateQueries({ queryKey: worldKeys.systems(novelId) })
    await queryClient.invalidateQueries({ queryKey: worldKeys.all(novelId) })
    await refetch()
  }

  const stopStream = () => {
    controllerRef.current?.abort()
    controllerRef.current = null
    setStreamPhase(null)
  }

  const applyStreamEvent = async (event: OutlineStreamEvent) => {
    const activityEvent = activityForEvent(event, t)
    if (activityEvent) appendActivity(activityEvent.tone, activityEvent.text)
    if (event.type === 'volume_outline') setStreamVolumes(prev => upsertVolume(prev ?? [], volumeFromEvent(event)))
    if (event.type === 'chapter_brief') setStreamVolumes(prev => upsertChapter(prev ?? baseVolumes, event.volume_number, chapterFromEvent(event)))
    if (event.type === 'error') setStreamError(outlineEventErrorMessage(event, t))
    if (event.type === 'done') {
      await invalidateOutline()
      setStreamVolumes(null)
    }
  }

  const consumeStream = async (payload: OutlineGenerateRequest) => {
    stopStream()
    const controller = new AbortController()
    controllerRef.current = controller
    setStreamPhase(payload.step)
    setStreamError(null)
    setStreamVolumes(payload.step === 'volume' ? [] : baseVolumes)
    setActivity([])
    try {
      for await (const event of streamOutlineGeneration(novelId, payload, { signal: controller.signal })) {
        await applyStreamEvent(event)
      }
    } catch (error) {
      if (controller.signal.aborted) {
        appendActivity('warning', t('worldModel.outline.activity.aborted'))
        return
      }
      const message = outlineErrorMessage(error, locale, t)
      setStreamError(message)
      appendActivity('error', message)
    } finally {
      controllerRef.current = null
      setStreamPhase(null)
    }
  }

  const handleGenerateVolumes = () => {
    void consumeStream({ step: 'volume', total_volumes_hint: parsePositiveInt(totalVolumesHint), user_guidance: guidance.trim() || undefined })
  }

  const handleGenerateChapters = () => {
    if (!selected) return
    void consumeStream({ step: 'chapter', volume_number: selected.volume_number, batch_size: parsePositiveInt(batchSize, 25), user_guidance: guidance.trim() || undefined })
  }

  const handleApprove = (volumeNumber?: number) => {
    approveOutline.mutate(volumeNumber ? { volume_number: volumeNumber } : {}, {
      onSuccess: async () => {
        await invalidateOutline()
        setStreamVolumes(null)
        toast(volumeNumber ? t('worldModel.outline.toast.approvedVolume', { volume: volumeNumber }) : t('worldModel.outline.toast.approvedAll'))
      },
      onError: () => toast(t('worldModel.outline.error.approveFailed')),
    })
  }

  return (
    <>
      <div className={cn('fixed inset-0 z-40 bg-[var(--nw-backdrop)] backdrop-blur-sm transition-opacity', open ? 'opacity-100' : 'opacity-0 pointer-events-none')} onClick={() => onOpenChange(false)} />
      <div className={cn('fixed inset-0 z-50 flex items-center justify-center p-4 transition-all duration-200', open ? 'opacity-100' : 'opacity-0 pointer-events-none')}>
        <div className='w-full max-w-6xl rounded-2xl border border-[var(--nw-glass-border-hover)] bg-[hsl(var(--nw-modal-bg))] backdrop-blur-[24px] shadow-[0_24px_80px_var(--nw-backdrop)]' onClick={(event) => event.stopPropagation()} data-testid='outline-management-dialog'>
          <DialogHeader isStreaming={isStreaming} onStop={stopStream} onClose={() => onOpenChange(false)} t={t} />
          <div className='grid min-h-[640px] grid-cols-[280px_minmax(0,1fr)]'>
            <aside className='border-r border-[var(--nw-glass-border)] bg-[var(--nw-glass-bg)]/40 p-4'>
              <div className='space-y-3'>
                <OutlineControls
                  tab={tab}
                  setTab={setTab}
                  guidance={guidance}
                  setGuidance={setGuidance}
                  totalVolumesHint={totalVolumesHint}
                  setTotalVolumesHint={setTotalVolumesHint}
                  batchSize={batchSize}
                  setBatchSize={setBatchSize}
                  runningVolume={streamPhase === 'volume'}
                  runningChapter={streamPhase === 'chapter'}
                  canGenerateVolumes={!isStreaming}
                  canGenerateChapters={!isStreaming && !!selected && selectedSystem?.status === 'confirmed'}
                  canApproveAll={!isStreaming && volumes.length > 0}
                  approvePending={approveOutline.isPending}
                  onGenerateVolumes={handleGenerateVolumes}
                  onGenerateChapters={handleGenerateChapters}
                  onApproveAll={() => handleApprove()}
                  t={t}
                />
                <ActivityPanel activity={activity} t={t} />
              </div>
            </aside>
            <div className='min-w-0 p-5'>
              <div className='grid h-full grid-rows-[auto_minmax(0,1fr)] gap-4'>
                <SummaryBar volumes={volumes} selected={selected} systemStatus={systemStatusLabel} streamError={streamError} t={t} />
                <div className='grid min-h-0 grid-cols-[320px_minmax(0,1fr)] gap-4'>
                  <VolumeList volumes={volumes} selected={selected} isLoading={isLoading} onSelect={setSelectedVolume} t={t} />
                  <VolumeDetail selected={selected} approvePending={approveOutline.isPending || isStreaming} onApprove={handleApprove} t={t} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
