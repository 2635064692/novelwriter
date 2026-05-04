import { useState, useEffect, useCallback } from 'react'
import { ChevronRight, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useUiLocale } from '@/contexts/UiLocaleContext'
import type { WorldSystem, OutlineVolume, OutlineChapter } from '@/types/api'

function statusColorChannels(status: string): string {
  return status === 'confirmed' ? 'var(--color-status-confirmed)' : 'var(--color-status-draft)'
}

function StatusBadge({ status, label }: { status: string; label: string }) {
  const channels = statusColorChannels(status)
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[11px] font-medium"
      style={{
        background: `hsl(${channels} / 0.08)`,
        color: `hsl(${channels})`,
        borderColor: `hsl(${channels} / 0.25)`,
      }}
    >
      <span className="block h-[5px] w-[5px] rounded-full" style={{ background: `hsl(${channels})` }} />
      {label}
    </span>
  )
}

function TwistDots({ level }: { level: number | null }) {
  if (level == null) return null
  return (
    <span className="inline-flex items-center gap-px shrink-0" title={`${level}/5`}>
      {[1, 2, 3, 4, 5].map(i => (
        <span key={i} className={cn('inline-block h-[6px] w-[6px] rounded-full', i <= level ? 'bg-accent' : 'bg-muted')} />
      ))}
    </span>
  )
}

export function OutlineEditor({ system }: { system: WorldSystem }) {
  const { t } = useUiLocale()
  const volume = system.data as unknown as OutlineVolume
  const chapters: OutlineChapter[] = Array.isArray(volume?.chapters) ? volume.chapters : []

  const [expandedChapters, setExpandedChapters] = useState<Set<number>>(new Set())
  const [showModal, setShowModal] = useState(false)

  const toggleChapter = useCallback((chapterNumber: number) => {
    setExpandedChapters(prev => {
      const next = new Set(prev)
      if (next.has(chapterNumber)) next.delete(chapterNumber)
      else next.add(chapterNumber)
      return next
    })
  }, [])

  // Escape key closes modal
  useEffect(() => {
    if (!showModal) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowModal(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [showModal])

  const status = system.status === 'confirmed' ? 'confirmed' : 'draft'
  const statusLabel = t(status === 'confirmed' ? 'worldModel.common.statusConfirmed' : 'worldModel.common.statusDraft')
  const outlinePreview = volume?.outline_text
    ? volume.outline_text.length > 150 ? `${volume.outline_text.slice(0, 150)}...` : volume.outline_text
    : null

  return (
    <>
      <div className="rounded-2xl border border-[var(--nw-glass-border)] bg-[var(--nw-glass-bg)] backdrop-blur-2xl overflow-hidden">
        {/* Volume header */}
        <div className="flex items-center gap-3 px-5 py-4">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent text-sm font-semibold text-accent-foreground">
            V{volume?.volume_number ?? '?'}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-[15px] font-semibold text-foreground truncate">
                {volume?.volume_title || t('worldModel.outline.volumeFallback', { volume: volume?.volume_number ?? '?' })}
              </span>
              <StatusBadge status={status} label={statusLabel} />
            </div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              {volume ? t('worldModel.outline.volumeRangeShort', { start: volume.chapter_start, end: volume.chapter_end }) : null}
              {volume ? ' · ' : null}
              {t('worldModel.outline.chapterCount', { count: chapters.length })}
            </div>
          </div>
          {volume ? (
            <button
              type="button"
              className="inline-flex shrink-0 items-center gap-1 rounded-md border border-[var(--nw-glass-border)] bg-muted px-2.5 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent/10"
              onClick={() => setShowModal(true)}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
              查看全文
            </button>
          ) : null}
        </div>

        {/* Volume outline preview (truncated) */}
        {outlinePreview ? (
          <div className="px-5 pb-2 text-[13px] leading-relaxed text-muted-foreground">
            {outlinePreview}
          </div>
        ) : null}

        {/* Chapter list */}
        <div className="border-t border-[var(--nw-glass-border)]">
          {chapters.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-muted-foreground">{t('worldModel.outline.chapterEmpty')}</div>
          ) : (
            chapters.map(ch => (
              <ChapterRow
                key={ch.chapter_number}
                chapter={ch}
                expanded={expandedChapters.has(ch.chapter_number)}
                onToggle={() => toggleChapter(ch.chapter_number)}
              />
            ))
          )}
        </div>
      </div>

      {showModal && volume ? (
        <VolumeModal volume={volume} onClose={() => setShowModal(false)} />
      ) : null}
    </>
  )
}

const SUSPENSE_LABEL: Record<string, string> = { low: '低悬念', medium: '中悬念', high: '高悬念' }

function ChapterRow({ chapter, expanded, onToggle }: { chapter: OutlineChapter; expanded: boolean; onToggle: () => void }) {
  const { t } = useUiLocale()
  const suspenseLabel = chapter.suspense_density ? (SUSPENSE_LABEL[chapter.suspense_density] ?? chapter.suspense_density) : null
  const contentId = `chapter-content-${chapter.chapter_number}`
  const lines = (chapter.brief_text || '').split('\n').filter(line => line.trim())

  return (
    <div className="border-b border-[var(--nw-glass-border)] last:border-b-0">
      <button
        type="button"
        className={cn('flex w-full items-center gap-2.5 px-5 py-3 text-left transition-colors hover:bg-[hsl(var(--muted))]', expanded && 'bg-[hsl(var(--muted))]')}
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={contentId}
      >
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted text-[11px] font-medium text-muted-foreground">
          {chapter.chapter_number}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-[13px] font-medium text-foreground truncate">
              {chapter.chapter_title || t('worldModel.outline.chapterFallback', { chapter: chapter.chapter_number })}
            </span>
            {suspenseLabel ? (
              <span className="rounded-full bg-muted px-1.5 py-px text-[10px] text-muted-foreground shrink-0">{suspenseLabel}</span>
            ) : null}
          </div>
          <p className="mt-0.5 overflow-hidden text-ellipsis whitespace-nowrap text-xs leading-relaxed text-muted-foreground">
            {chapter.brief_text || t('worldModel.outline.chapterBriefEmpty')}
          </p>
        </div>
        <TwistDots level={chapter.cognitive_twist} />
        <ChevronRight
          className={cn('h-[18px] w-[18px] shrink-0 text-muted-foreground/50 transition-transform duration-200', expanded && 'rotate-90')}
        />
      </button>
      {expanded ? (
        <div id={contentId} className="pb-3.5 pr-5 pl-[54px]">
          {lines.length > 0 ? (
            <ol className="m-0 list-outside list-decimal space-y-1 pl-4 text-[13px] leading-relaxed text-foreground">
              {lines.map((line, i) => (
                <li key={i}>{line.replace(/^\d+\.\s*/, '')}</li>
              ))}
            </ol>
          ) : (
            <div className="text-[13px] text-muted-foreground">{t('worldModel.outline.chapterBriefEmpty')}</div>
          )}
          {(chapter.suspense_density || chapter.cognitive_twist) ? (
            <div className="mt-2 text-[11px] text-muted-foreground">
              {t('worldModel.outline.chapterMeta', {
                suspense: chapter.suspense_density ?? t('worldModel.common.none'),
                twist: chapter.cognitive_twist ?? t('worldModel.common.none'),
              })}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function VolumeModal({ volume, onClose }: { volume: OutlineVolume; onClose: () => void }) {
  const { t } = useUiLocale()

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      previous?.focus?.()
    }
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--nw-backdrop)] backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={volume.volume_title || t('worldModel.outline.volumeFallback', { volume: volume.volume_number })}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="flex max-h-[85vh] w-[740px] max-w-[92vw] flex-col rounded-2xl border border-[var(--nw-glass-border-hover)]"
        style={{ background: 'hsl(var(--nw-modal-bg))', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', boxShadow: '0 24px 80px rgba(0,0,0,0.18), 0 4px 16px rgba(0,0,0,0.08)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--nw-glass-border)] px-6 py-4">
          <span className="truncate text-base font-semibold text-foreground">
            {volume.volume_title || t('worldModel.outline.volumeFallback', { volume: volume.volume_number })}
          </span>
          <button
            type="button"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground transition-colors hover:bg-muted/80"
            onClick={onClose}
            aria-label={t('worldModel.common.remove')}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5 text-[13px] leading-relaxed whitespace-pre-wrap break-words text-foreground">
          {volume.outline_text || t('worldModel.outline.volumeOutlineEmpty')}
        </div>
        <div className="flex justify-end border-t border-[var(--nw-glass-border)] px-6 py-3.5">
          <button
            type="button"
            className="rounded-lg bg-accent px-5 py-2 text-[13px] font-medium text-accent-foreground transition-opacity hover:opacity-90"
            onClick={onClose}
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  )
}
