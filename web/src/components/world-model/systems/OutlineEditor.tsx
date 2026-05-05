import { useState, useEffect, useCallback } from 'react'
import { ChevronRight, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { InlineEdit } from '@/components/world-model/shared/InlineEdit'
import { useUiLocale } from '@/contexts/UiLocaleContext'
import type { OutlineVolume, OutlineChapter } from '@/types/api'

function sanitizeVolume(v: Record<string, unknown>): OutlineVolume {
  return {
    volume_number: (typeof v.volume_number === 'number' && v.volume_number >= 1) ? v.volume_number : 1,
    volume_title: typeof v.volume_title === 'string' ? v.volume_title : '',
    chapter_start: (typeof v.chapter_start === 'number' && v.chapter_start >= 1) ? v.chapter_start : 1,
    chapter_end: (typeof v.chapter_end === 'number' && v.chapter_end >= 1) ? v.chapter_end : 1,
    outline_text: typeof v.outline_text === 'string' ? v.outline_text : '',
    chapters: (Array.isArray(v.chapters) ? v.chapters : []).map((c: Record<string, unknown>) => ({
      chapter_number: (typeof c.chapter_number === 'number' && c.chapter_number >= 1) ? c.chapter_number : 1,
      chapter_title: typeof c.chapter_title === 'string' ? c.chapter_title : '',
      brief_text: typeof c.brief_text === 'string' ? c.brief_text : '',
      suspense_density: typeof c.suspense_density === 'string' ? c.suspense_density : null,
      cognitive_twist: (typeof c.cognitive_twist === 'number' && c.cognitive_twist >= 1 && c.cognitive_twist <= 5) ? c.cognitive_twist : null,
    })),
  }
}

const SUSPENSE_OPTIONS = ['low', 'medium', 'high'] as const
const SUSPENSE_LABEL: Record<string, string> = { low: '低悬念', medium: '中悬念', high: '高悬念' }

function statusColorChannels(status: string): string {
  return status === 'confirmed' ? 'var(--color-status-confirmed)' : 'var(--color-status-draft)'
}

function StatusBadge({ status, label }: { status: string; label: string }) {
  const channels = statusColorChannels(status)
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[11px] font-medium shrink-0"
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

function TwistSelector({ level, onChange }: { level: number | null; onChange: (v: number | null) => void }) {
  return (
    <span className="inline-flex items-center gap-0.5 shrink-0" role="radiogroup" aria-label="认知转折" title={level != null ? `${level}/5` : undefined}>
      {[1, 2, 3, 4, 5].map(i => (
        <button
          key={i}
          type="button"
          className={cn('inline-block h-2 w-2 rounded-full cursor-pointer', i <= (level ?? 0) ? 'bg-accent' : 'bg-muted')}
          onClick={(e) => { e.stopPropagation(); onChange(i === level ? null : i) }}
          aria-label={`${i}/5`}
        />
      ))}
    </span>
  )
}

function SuspenseChip({ density, onChange }: { density: string | null; onChange: (v: string | null) => void }) {
  const next = () => {
    if (!density) { onChange('low'); return }
    const idx = SUSPENSE_OPTIONS.indexOf(density as typeof SUSPENSE_OPTIONS[number])
    if (idx < 0 || idx >= SUSPENSE_OPTIONS.length - 1) { onChange(null); return }
    onChange(SUSPENSE_OPTIONS[idx + 1])
  }
  return (
    <button
      type="button"
      className={cn('rounded-full bg-muted px-1.5 py-px text-[10px] shrink-0 cursor-pointer transition-colors', density ? 'text-muted-foreground' : 'text-muted-foreground/50')}
      onClick={(e) => { e.stopPropagation(); next() }}
      title="点击切换悬念密度：低→中→高→清除"
    >
      {density ? SUSPENSE_LABEL[density] ?? density : '+悬念'}
    </button>
  )
}

export function OutlineEditor({ volume: initialVolume, status, onUpdate }: {
  volume: OutlineVolume
  status: string
  onUpdate: (data: OutlineVolume) => void
}) {
  const { t } = useUiLocale()
  const volume = initialVolume
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

  useEffect(() => {
    if (!showModal) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowModal(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [showModal])

  const isConfirmed = status === 'confirmed'
  const statusLabel = t(isConfirmed ? 'worldModel.common.statusConfirmed' : 'worldModel.common.statusDraft')

  const updateVolume = (patch: Partial<OutlineVolume>) => onUpdate(sanitizeVolume({ ...volume, ...patch }))
  const updateChapter = (chapterNumber: number, patch: Partial<OutlineChapter>) => {
    let updated = chapters.map(ch => ch.chapter_number === chapterNumber ? { ...ch, ...patch } : ch)
    if (patch.chapter_number != null) {
      updated = [...updated].sort((a, b) => a.chapter_number - b.chapter_number)
    }
    onUpdate(sanitizeVolume({ ...volume, chapters: updated }))
  }

  const deleteChapter = (chapterNumber: number) => {
    const updated = chapters.filter(ch => ch.chapter_number !== chapterNumber)
    setExpandedChapters(prev => { const next = new Set(prev); next.delete(chapterNumber); return next })
    onUpdate(sanitizeVolume({ ...volume, chapters: updated }))
  }

  const setChapterRange = (field: 'chapter_start' | 'chapter_end', raw: string) => {
    const n = Number.parseInt(raw, 10)
    if (!Number.isFinite(n) || n < 1) return
    const patch: Partial<OutlineVolume> = { [field]: n }
    if (field === 'chapter_end' && n < volume.chapter_start) {
      patch.chapter_start = n
    }
    if (field === 'chapter_start' && n > volume.chapter_end) {
      patch.chapter_end = n
    }
    onUpdate(sanitizeVolume({ ...volume, ...patch }))
  }

  const addChapter = () => {
    const nextNum = chapters.length > 0 ? Math.max(...chapters.map(c => c.chapter_number)) + 1 : volume.chapter_start
    const newChapter: OutlineChapter = {
      chapter_number: nextNum,
      chapter_title: '',
      brief_text: '',
      suspense_density: null,
      cognitive_twist: null,
    }
    const newEnd = Math.max(volume.chapter_end, nextNum)
    setExpandedChapters(prev => { const next = new Set(prev); next.add(nextNum); return next })
    onUpdate(sanitizeVolume({
      ...volume,
      chapter_end: newEnd,
      chapters: [...chapters, newChapter],
    }))
  }

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
              <InlineEdit
                value={volume?.volume_title ?? ''}
                onSave={v => updateVolume({ volume_title: v })}
                className="text-[15px] font-semibold"
                placeholder={t('worldModel.outline.volumeFallback', { volume: volume?.volume_number ?? '?' })}
              />
              <StatusBadge status={status} label={statusLabel} />
            </div>
            <div className="mt-0.5 text-xs text-muted-foreground flex items-center gap-0.5 flex-wrap">
              {volume ? (
                <>
                  <span>第</span>
                  <InlineEdit
                    value={String(volume.chapter_start)}
                    onSave={v => setChapterRange('chapter_start', v)}
                    className="text-xs font-medium tabular-nums"
                    placeholder="1"
                  />
                  <span>–</span>
                  <InlineEdit
                    value={String(volume.chapter_end)}
                    onSave={v => setChapterRange('chapter_end', v)}
                    className="text-xs font-medium tabular-nums"
                    placeholder="1"
                  />
                  <span>章</span>
                  <span>·</span>
                </>
              ) : null}
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
              卷纲详情
            </button>
          ) : null}
        </div>

        {/* Volume outline preview + inline edit */}
        <div className="px-5 pb-3">
          <InlineEdit
            value={volume?.outline_text ?? ''}
            onSave={v => updateVolume({ outline_text: v })}
            multiline
            variant="transparent"
            className="text-[13px] text-muted-foreground"
            placeholder={t('worldModel.outline.volumeOutlineEmpty')}
          />
        </div>

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
                onUpdate={patch => updateChapter(ch.chapter_number, patch)}
                onDelete={() => deleteChapter(ch.chapter_number)}
              />
            ))
          )}
          <button
            type="button"
            className="flex w-full items-center justify-center gap-1 px-5 py-2.5 text-xs text-muted-foreground transition-colors hover:text-accent hover:bg-[hsl(var(--muted))]"
            onClick={addChapter}
          >
            + 添加章纲
          </button>
        </div>
      </div>

      {showModal && volume ? (
        <VolumeModal volume={volume} onUpdate={onUpdate} onClose={() => setShowModal(false)} />
      ) : null}
    </>
  )
}

function ChapterRow({ chapter, expanded, onToggle, onUpdate, onDelete }: {
  chapter: OutlineChapter
  expanded: boolean
  onToggle: () => void
  onUpdate: (patch: Partial<OutlineChapter>) => void
  onDelete: () => void
}) {
  const { t } = useUiLocale()
  const contentId = `chapter-content-${chapter.chapter_number}`
  const [hovered, setHovered] = useState(false)

  return (
    <div
      className="border-b border-[var(--nw-glass-border)] last:border-b-0"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="flex items-stretch">
        <button
          type="button"
          className={cn('flex flex-1 min-w-0 items-center gap-2 px-5 py-3 text-left transition-colors hover:bg-[hsl(var(--muted))]', expanded && 'bg-[hsl(var(--muted))]')}
          onClick={onToggle}
          aria-expanded={expanded}
          aria-controls={contentId}
        >
          <InlineEdit
            value={String(chapter.chapter_number)}
            onSave={v => {
              const n = Number.parseInt(v, 10)
              if (Number.isFinite(n) && n >= 1 && n !== chapter.chapter_number) onUpdate({ chapter_number: n })
            }}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted text-[11px] font-medium text-muted-foreground tabular-nums text-center"
            placeholder="?"
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="text-[13px] font-medium text-foreground truncate">
                {chapter.chapter_title || t('worldModel.outline.chapterFallback', { chapter: chapter.chapter_number })}
              </span>
              <SuspenseChip density={chapter.suspense_density} onChange={v => onUpdate({ suspense_density: v })} />
            </div>
            <p className="mt-0.5 overflow-hidden text-ellipsis whitespace-nowrap text-xs leading-relaxed text-muted-foreground">
              {chapter.brief_text || t('worldModel.outline.chapterBriefEmpty')}
            </p>
          </div>
          <TwistSelector level={chapter.cognitive_twist} onChange={v => onUpdate({ cognitive_twist: v })} />
          <ChevronRight
            className={cn('h-[18px] w-[18px] shrink-0 text-muted-foreground/50 transition-transform duration-200', expanded && 'rotate-90')}
          />
        </button>
        {hovered ? (
          <button
            type="button"
            className="shrink-0 px-2 text-muted-foreground hover:text-[hsl(var(--color-danger))] transition-colors"
            onClick={(e) => { e.stopPropagation(); onDelete() }}
            title="删除章纲"
          >
            ×
          </button>
        ) : null}
      </div>
      {expanded ? (
        <div id={contentId} className="pb-3.5 px-5 pl-[54px] space-y-3">
          <div>
            <InlineEdit
              value={chapter.chapter_title ?? ''}
              onSave={v => onUpdate({ chapter_title: v })}
              className="text-[13px] font-medium"
              placeholder={t('worldModel.outline.chapterFallback', { chapter: chapter.chapter_number })}
            />
          </div>
          <div>
            <InlineEdit
              value={chapter.brief_text ?? ''}
              onSave={v => onUpdate({ brief_text: v })}
              multiline
              variant="glass"
              className="text-[13px] text-foreground"
              placeholder={t('worldModel.outline.chapterBriefEmpty')}
            />
          </div>
          {(chapter.suspense_density || chapter.cognitive_twist) ? (
            <div className="text-[11px] text-muted-foreground">
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

function VolumeModal({ volume, onUpdate, onClose }: {
  volume: OutlineVolume
  onUpdate: (data: OutlineVolume) => void
  onClose: () => void
}) {
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
          <InlineEdit
            value={volume.volume_title ?? ''}
            onSave={v => onUpdate(sanitizeVolume({ ...volume, volume_title: v }))}
            className="text-base font-semibold truncate"
            placeholder={t('worldModel.outline.volumeFallback', { volume: volume.volume_number })}
          />
          <button
            type="button"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground transition-colors hover:bg-muted/80 ml-3"
            onClick={onClose}
            aria-label={t('worldModel.common.remove')}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <InlineEdit
            value={volume.outline_text ?? ''}
            onSave={v => onUpdate(sanitizeVolume({ ...volume, outline_text: v }))}
            multiline
            variant="transparent"
            className="text-[13px] leading-relaxed text-foreground"
            placeholder={t('worldModel.outline.volumeOutlineEmpty')}
          />
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
