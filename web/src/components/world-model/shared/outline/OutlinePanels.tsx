import type { ReactNode } from 'react'
import { BookOpen, Check, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import type { OutlineChapter, OutlineVolume } from '@/types/api'
import type { ActivityItem, Translate } from './types'

export function ActivityPanel({ activity, t }: { activity: ActivityItem[]; t: Translate }) {
  return (
    <div className='rounded-xl border border-[var(--nw-glass-border)] bg-[hsl(var(--background)/0.24)] p-3'>
      <div className='mb-2 flex items-center gap-2 text-xs font-medium text-foreground'>
        <BookOpen className='h-3.5 w-3.5' />
        {t('worldModel.outline.activityTitle')}
      </div>
      <div className='space-y-2 text-[11px] text-muted-foreground'>
        {activity.length === 0 ? <div>{t('worldModel.outline.activityEmpty')}</div> : activity.map(item => <ActivityRow key={item.id} item={item} />)}
      </div>
    </div>
  )
}

function ActivityRow({ item }: { item: ActivityItem }) {
  return (
    <div className={cn(
      'rounded-lg border px-2.5 py-2',
      item.tone === 'error'
        ? 'border-[hsl(var(--color-warning)/0.35)] bg-[hsl(var(--color-warning)/0.10)] text-[hsl(var(--color-warning))]'
        : item.tone === 'success'
          ? 'border-[hsl(var(--color-status-confirmed)/0.20)] bg-[hsl(var(--color-status-confirmed)/0.08)] text-foreground'
          : 'border-[var(--nw-glass-border)] bg-[hsl(var(--background)/0.18)]',
    )}>
      {item.text}
    </div>
  )
}

export function SummaryBar({ volumes, selected, systemStatus, streamError, t }: { volumes: OutlineVolume[]; selected: OutlineVolume | null; systemStatus: string; streamError: string | null; t: Translate }) {
  return (
    <div className='rounded-2xl border border-[var(--nw-glass-border)] bg-[var(--nw-glass-bg)] p-4 backdrop-blur-2xl'>
      <div className='flex flex-wrap items-center gap-2'>
        <SummaryPill>{t('worldModel.outline.summaryVolumes', { count: volumes.length })}</SummaryPill>
        <SummaryPill>{t('worldModel.outline.summaryStatus', { status: systemStatus })}</SummaryPill>
        {selected ? <SummaryPill>{t('worldModel.outline.summarySelected', { volume: selected.volume_number })}</SummaryPill> : null}
      </div>
      {streamError ? (
        <div className='mt-3 rounded-lg border border-[hsl(var(--color-warning)/0.35)] bg-[hsl(var(--color-warning)/0.10)] px-3 py-2 text-xs text-[hsl(var(--color-warning))] whitespace-pre-wrap'>
          {streamError}
        </div>
      ) : null}
    </div>
  )
}

function SummaryPill({ children }: { children: ReactNode }) {
  return <span className='rounded-full border border-[var(--nw-glass-border)] bg-[hsl(var(--background)/0.28)] px-2.5 py-1 text-xs text-muted-foreground'>{children}</span>
}

export function VolumeList({ volumes, selected, isLoading, onSelect, t }: { volumes: OutlineVolume[]; selected: OutlineVolume | null; isLoading: boolean; onSelect: (volume: number) => void; t: Translate }) {
  return (
    <div className='min-h-0 overflow-hidden rounded-2xl border border-[var(--nw-glass-border)] bg-[var(--nw-glass-bg)] backdrop-blur-2xl'>
      <div className='border-b border-[var(--nw-glass-border)] px-4 py-3 text-sm font-medium text-foreground'>{t('worldModel.outline.volumeListTitle')}</div>
      <div className='nw-scrollbar-thin max-h-full min-h-0 overflow-y-auto'>
        {isLoading ? <div className='px-4 py-3 text-sm text-muted-foreground'>{t('studio.loading')}</div> : null}
        {!isLoading && volumes.length === 0 ? <div className='px-4 py-6 text-sm text-muted-foreground'>{t('worldModel.outline.empty')}</div> : null}
        {!isLoading ? volumes.map(volume => <VolumeListItem key={volume.volume_number} volume={volume} active={selected?.volume_number === volume.volume_number} onSelect={onSelect} t={t} />) : null}
      </div>
    </div>
  )
}

function VolumeListItem({ volume, active, onSelect, t }: { volume: OutlineVolume; active: boolean; onSelect: (volume: number) => void; t: Translate }) {
  return (
    <button
      type='button'
      className={cn('flex w-full items-center gap-3 border-l-2 px-4 py-3 text-left transition-colors', active ? 'border-l-accent bg-[var(--nw-glass-bg-hover)]' : 'border-l-transparent hover:bg-[var(--nw-glass-bg-hover)]')}
      onClick={() => onSelect(volume.volume_number)}
    >
      <div className='flex-1 min-w-0'>
        <div className='flex items-center gap-2'>
          <span className='truncate text-sm font-medium text-foreground'>{volume.volume_title || t('worldModel.outline.volumeFallback', { volume: volume.volume_number })}</span>
        </div>
        <div className='mt-1 text-[11px] text-muted-foreground'>
          {t('worldModel.outline.volumeRangeShort', { start: volume.chapter_start, end: volume.chapter_end })} · {t('worldModel.outline.chapterCount', { count: volume.chapters.length })}
        </div>
      </div>
      <ChevronRight className='h-4 w-4 shrink-0 text-muted-foreground/45' />
    </button>
  )
}

export function VolumeDetail({ selected, approvePending, onApprove, t }: { selected: OutlineVolume | null; approvePending: boolean; onApprove: (volume: number) => void; t: Translate }) {
  if (!selected) {
    return (
      <div className='min-h-0 overflow-hidden rounded-2xl border border-[var(--nw-glass-border)] bg-[var(--nw-glass-bg)] backdrop-blur-2xl'>
        <div className='flex h-full items-center justify-center px-6 text-sm text-muted-foreground'>{t('worldModel.outline.selectPrompt')}</div>
      </div>
    )
  }
  return (
    <div className='min-h-0 overflow-hidden rounded-2xl border border-[var(--nw-glass-border)] bg-[var(--nw-glass-bg)] backdrop-blur-2xl'>
      <div className='flex h-full min-h-0 flex-col'>
        <VolumeDetailHeader selected={selected} approvePending={approvePending} onApprove={onApprove} t={t} />
        <div className='grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] gap-4 px-5 py-4'>
          <VolumeOutline selected={selected} t={t} />
          <ChapterList chapters={selected.chapters} t={t} />
        </div>
      </div>
    </div>
  )
}

function VolumeDetailHeader({ selected, approvePending, onApprove, t }: { selected: OutlineVolume; approvePending: boolean; onApprove: (volume: number) => void; t: Translate }) {
  return (
    <div className='border-b border-[var(--nw-glass-border)] px-5 py-4'>
      <div className='flex flex-wrap items-start gap-3'>
        <div className='min-w-0 flex-1'>
          <div className='truncate text-lg font-semibold text-foreground'>{selected.volume_title || t('worldModel.outline.volumeFallback', { volume: selected.volume_number })}</div>
          <div className='mt-1 text-sm text-muted-foreground'>{t('worldModel.outline.volumeRange', { start: selected.chapter_start, end: selected.chapter_end })}</div>
        </div>
        <Button type='button' size='sm' variant='outline' className='h-8 border-[var(--nw-glass-border)] bg-transparent hover:bg-[var(--nw-glass-bg-hover)]' disabled={approvePending} onClick={() => onApprove(selected.volume_number)}>
          <Check className='mr-2 h-4 w-4' />
          {t('worldModel.outline.approveVolume')}
        </Button>
      </div>
    </div>
  )
}

function VolumeOutline({ selected, t }: { selected: OutlineVolume; t: Translate }) {
  return (
    <div className='rounded-xl border border-[var(--nw-glass-border)] bg-[hsl(var(--background)/0.24)] px-4 py-3'>
      <div className='mb-2 text-xs font-semibold tracking-wider text-muted-foreground'>{t('worldModel.outline.volumeOutlineTitle')}</div>
      <div className='max-h-[180px] overflow-y-auto whitespace-pre-wrap text-sm leading-6 text-foreground'>{selected.outline_text || t('worldModel.outline.volumeOutlineEmpty')}</div>
    </div>
  )
}

function ChapterList({ chapters, t }: { chapters: OutlineChapter[]; t: Translate }) {
  return (
    <div className='min-h-0 overflow-hidden rounded-xl border border-[var(--nw-glass-border)] bg-[hsl(var(--background)/0.24)]'>
      <div className='border-b border-[var(--nw-glass-border)] px-4 py-3 text-xs font-semibold tracking-wider text-muted-foreground'>{t('worldModel.outline.chapterListTitle')}</div>
      <div className='nw-scrollbar-thin min-h-0 overflow-y-auto px-4 py-3'>
        {chapters.length === 0 ? <div className='text-sm text-muted-foreground'>{t('worldModel.outline.chapterEmpty')}</div> : <div className='space-y-3'>{chapters.map(chapter => <ChapterCard key={chapter.chapter_number} chapter={chapter} t={t} />)}</div>}
      </div>
    </div>
  )
}

function ChapterCard({ chapter, t }: { chapter: OutlineChapter; t: Translate }) {
  return (
    <div className='rounded-xl border border-[var(--nw-glass-border)] bg-[var(--nw-glass-bg)] px-4 py-3'>
      <div className='flex flex-wrap items-center gap-2'>
        <div className='text-sm font-medium text-foreground'>{chapter.chapter_title || t('worldModel.outline.chapterFallback', { chapter: chapter.chapter_number })}</div>
        <span className='text-[11px] text-muted-foreground'>#{chapter.chapter_number}</span>
      </div>
      <div className='mt-2 whitespace-pre-wrap text-sm leading-6 text-foreground'>{chapter.brief_text || t('worldModel.outline.chapterBriefEmpty')}</div>
      {(chapter.suspense_density || chapter.cognitive_twist) ? (
        <div className='mt-2 text-[11px] text-muted-foreground'>{t('worldModel.outline.chapterMeta', { suspense: chapter.suspense_density || t('worldModel.common.none'), twist: chapter.cognitive_twist || t('worldModel.common.none') })}</div>
      ) : null}
    </div>
  )
}
