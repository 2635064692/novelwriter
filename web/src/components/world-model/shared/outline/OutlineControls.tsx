import { Check, Loader2, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { ScopeTab, Translate } from './types'

export function OutlineControls({
  tab,
  setTab,
  guidance,
  setGuidance,
  totalVolumesHint,
  setTotalVolumesHint,
  batchSize,
  setBatchSize,
  runningVolume,
  runningChapter,
  canGenerateVolumes,
  canGenerateChapters,
  canApproveAll,
  approvePending,
  onGenerateVolumes,
  onGenerateChapters,
  onApproveAll,
  t,
}: {
  tab: ScopeTab
  setTab: (tab: ScopeTab) => void
  guidance: string
  setGuidance: (value: string) => void
  totalVolumesHint: string
  setTotalVolumesHint: (value: string) => void
  batchSize: string
  setBatchSize: (value: string) => void
  runningVolume: boolean
  runningChapter: boolean
  canGenerateVolumes: boolean
  canGenerateChapters: boolean
  canApproveAll: boolean
  approvePending: boolean
  onGenerateVolumes: () => void
  onGenerateChapters: () => void
  onApproveAll: () => void
  t: Translate
}) {
  return (
    <div className='rounded-xl border border-[var(--nw-glass-border)] bg-[hsl(var(--background)/0.28)] p-3 space-y-3'>
      <Tabs value={tab} onValueChange={(value) => setTab(value as ScopeTab)}>
        <TabsList className='w-full bg-[hsl(var(--background)/0.35)]'>
          <TabsTrigger value='volumes' className='flex-1 text-xs'>{t('worldModel.outline.tabVolumes')}</TabsTrigger>
          <TabsTrigger value='chapters' className='flex-1 text-xs'>{t('worldModel.outline.tabChapters')}</TabsTrigger>
        </TabsList>
      </Tabs>
      <GuidanceInput guidance={guidance} setGuidance={setGuidance} t={t} />
      {tab === 'volumes' ? (
        <VolumeActions
          totalVolumesHint={totalVolumesHint}
          setTotalVolumesHint={setTotalVolumesHint}
          running={runningVolume}
          canGenerate={canGenerateVolumes}
          canApproveAll={canApproveAll}
          approvePending={approvePending}
          onGenerate={onGenerateVolumes}
          onApproveAll={onApproveAll}
          t={t}
        />
      ) : (
        <ChapterActions
          batchSize={batchSize}
          setBatchSize={setBatchSize}
          running={runningChapter}
          canGenerate={canGenerateChapters}
          onGenerate={onGenerateChapters}
          t={t}
        />
      )}
    </div>
  )
}

function GuidanceInput({ guidance, setGuidance, t }: { guidance: string; setGuidance: (value: string) => void; t: Translate }) {
  return (
    <div className='space-y-1'>
      <div className='text-xs font-medium text-foreground'>{t('worldModel.outline.guidanceLabel')}</div>
      <Textarea
        value={guidance}
        onChange={(event) => setGuidance(event.target.value)}
        placeholder={t('worldModel.outline.guidancePlaceholder')}
        className='min-h-[84px] border-[var(--nw-glass-border)] bg-transparent text-foreground placeholder:text-muted-foreground/70 focus-visible:ring-accent focus-visible:ring-offset-0'
      />
    </div>
  )
}

function VolumeActions({
  totalVolumesHint,
  setTotalVolumesHint,
  running,
  canGenerate,
  canApproveAll,
  approvePending,
  onGenerate,
  onApproveAll,
  t,
}: {
  totalVolumesHint: string
  setTotalVolumesHint: (value: string) => void
  running: boolean
  canGenerate: boolean
  canApproveAll: boolean
  approvePending: boolean
  onGenerate: () => void
  onApproveAll: () => void
  t: Translate
}) {
  return (
    <>
      <div className='space-y-1'>
        <div className='text-xs font-medium text-foreground'>{t('worldModel.outline.totalVolumesHint')}</div>
        <Input inputMode='numeric' value={totalVolumesHint} onChange={(event) => setTotalVolumesHint(event.target.value.replace(/[^0-9]/g, ''))} placeholder='3' className='h-9 border-[var(--nw-glass-border)] bg-transparent text-sm focus-visible:ring-accent focus-visible:ring-offset-0' />
      </div>
      <Button type='button' size='sm' className='h-9 w-full' disabled={!canGenerate} onClick={onGenerate} data-testid='outline-generate-volumes'>
        {running ? <Loader2 className='mr-2 h-4 w-4 animate-spin' /> : <Sparkles className='mr-2 h-4 w-4' />}
        {running ? t('worldModel.outline.generatingVolumes') : t('worldModel.outline.generateVolumes')}
      </Button>
      <Button type='button' size='sm' variant='outline' className='h-9 w-full border-[var(--nw-glass-border)] bg-transparent hover:bg-[var(--nw-glass-bg-hover)]' disabled={!canApproveAll || approvePending} onClick={onApproveAll}>
        <Check className='mr-2 h-4 w-4' />
        {t('worldModel.outline.approveAllVolumes')}
      </Button>
    </>
  )
}

function ChapterActions({ batchSize, setBatchSize, running, canGenerate, onGenerate, t }: { batchSize: string; setBatchSize: (value: string) => void; running: boolean; canGenerate: boolean; onGenerate: () => void; t: Translate }) {
  return (
    <>
      <div className='space-y-1'>
        <div className='text-xs font-medium text-foreground'>{t('worldModel.outline.batchSize')}</div>
        <Input inputMode='numeric' value={batchSize} onChange={(event) => setBatchSize(event.target.value.replace(/[^0-9]/g, ''))} placeholder='25' className='h-9 border-[var(--nw-glass-border)] bg-transparent text-sm focus-visible:ring-accent focus-visible:ring-offset-0' />
      </div>
      <Button type='button' size='sm' className='h-9 w-full' disabled={!canGenerate} onClick={onGenerate} data-testid='outline-generate-chapters'>
        {running ? <Loader2 className='mr-2 h-4 w-4 animate-spin' /> : <Sparkles className='mr-2 h-4 w-4' />}
        {running ? t('worldModel.outline.generatingChapters') : t('worldModel.outline.generateChapters')}
      </Button>
      <div className='text-[11px] leading-4 text-muted-foreground'>{t('worldModel.outline.chapterGenerationHint')}</div>
    </>
  )
}
