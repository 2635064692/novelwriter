import { ApiError } from '@/services/api'
import { getLlmApiErrorMessage } from '@/lib/llmErrorMessages'
import type { OutlineChapter, OutlineStreamEvent, OutlineVolume } from '@/types/api'
import type { ActivityItem, Translate, UiLocale } from './types'

export function statusClassName(status: 'draft' | 'approved') {
  return status === 'approved'
    ? 'text-[hsl(var(--color-status-confirmed))]'
    : 'text-[hsl(var(--color-status-draft))]'
}

export function appendActivityItem(items: ActivityItem[], tone: ActivityItem['tone'], text: string): ActivityItem[] {
  return [...items.slice(-19), { id: `${Date.now()}-${items.length}`, tone, text }]
}

export function parsePositiveInt(value: string, fallback?: number): number | undefined {
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

export function volumeFromEvent(event: Extract<OutlineStreamEvent, { type: 'volume_outline' }>): OutlineVolume {
  return {
    volume_number: event.volume_number,
    volume_title: event.volume_title,
    chapter_start: event.chapter_start,
    chapter_end: event.chapter_end,
    outline_text: event.outline_text,
    status: 'draft',
    chapters: [],
  }
}

export function chapterFromEvent(event: Extract<OutlineStreamEvent, { type: 'chapter_brief' }>): OutlineChapter {
  return {
    chapter_number: event.chapter_number,
    chapter_title: event.chapter_title,
    brief_text: event.brief_text,
    suspense_density: event.suspense_density,
    cognitive_twist: event.cognitive_twist,
    status: 'draft',
  }
}

export function upsertVolume(volumes: OutlineVolume[], next: OutlineVolume): OutlineVolume[] {
  const found = volumes.some(volume => volume.volume_number === next.volume_number)
  const merged = found
    ? volumes.map(volume => volume.volume_number === next.volume_number ? { ...next, chapters: volume.chapters } : volume)
    : [...volumes, next]
  return [...merged].sort((left, right) => left.volume_number - right.volume_number)
}

export function upsertChapter(volumes: OutlineVolume[], volumeNumber: number, next: OutlineChapter): OutlineVolume[] {
  return volumes.map((volume) => {
    if (volume.volume_number !== volumeNumber) return volume
    const found = volume.chapters.some(chapter => chapter.chapter_number === next.chapter_number)
    const chapters = found
      ? volume.chapters.map(chapter => chapter.chapter_number === next.chapter_number ? next : chapter)
      : [...volume.chapters, next]
    return {
      ...volume,
      status: 'draft',
      chapters: [...chapters].sort((left, right) => left.chapter_number - right.chapter_number),
    }
  })
}

export function outlineEventErrorMessage(event: Extract<OutlineStreamEvent, { type: 'error' }>, t: Translate): string {
  if (event.code === 'outline_invalid_request') return t('worldModel.outline.error.invalidRequest')
  if (event.code) return t('worldModel.outline.error.generic')
  return event.message || t('worldModel.outline.error.generic')
}

export function activityForEvent(event: OutlineStreamEvent, t: Translate): { tone: ActivityItem['tone']; text: string } | null {
  switch (event.type) {
    case 'start':
      return {
        tone: 'info',
        text: event.phase === 'volume_outline'
          ? t('worldModel.outline.activity.startVolume', { count: event.total_chapters })
          : t('worldModel.outline.activity.startChapter', { count: event.volumes_to_generate }),
      }
    case 'volume_outline':
      return { tone: 'success', text: t('worldModel.outline.activity.volumeReady', { volume: event.volume_number, start: event.chapter_start, end: event.chapter_end }) }
    case 'volume_start':
      return { tone: 'info', text: t('worldModel.outline.activity.volumeStart', { volume: event.volume_number }) }
    case 'chapter_brief':
      return { tone: 'success', text: t('worldModel.outline.activity.chapterReady', { volume: event.volume_number, chapter: event.chapter_number }) }
    case 'batch_done':
      return { tone: 'info', text: t('worldModel.outline.activity.batchDone', { volume: event.volume_number, batch: event.batch, total: event.total_batches }) }
    case 'volume_done':
      return { tone: 'success', text: t('worldModel.outline.activity.volumeDone', { volume: event.volume_number, count: event.chapter_count }) }
    case 'done':
      return {
        tone: 'success',
        text: event.phase === 'volume_outline'
          ? t('worldModel.outline.activity.doneVolume', { count: event.volumes_generated })
          : t('worldModel.outline.activity.doneChapter', { count: event.chapters_generated }),
      }
    case 'error':
      return { tone: 'error', text: outlineEventErrorMessage(event, t) }
  }
}

export function outlineErrorMessage(error: unknown, locale: UiLocale, t: Translate): string {
  if (error instanceof ApiError) {
    const llmMessage = getLlmApiErrorMessage(error, locale)
    if (llmMessage) return llmMessage
    if (error.code === 'outline_invalid_request') return t('worldModel.outline.error.invalidRequest')
  }
  if (error instanceof Error) return error.message
  return t('worldModel.outline.error.generic')
}
