import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, Clock3, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useUiLocale } from '@/contexts/UiLocaleContext'
import { copilotApi } from '@/services/api'
import type { CopilotMode, CopilotSessionListItem } from '@/types/copilot'
import {
  copilotPanelClassName,
  copilotPillClassName,
  copilotPillInteractiveClassName,
} from './novelCopilotChrome'

type ModeFilter = 'all' | CopilotMode

const MODE_FILTERS = [
  { key: 'all', labelKey: 'copilot.history.filter.all' },
  { key: 'research', labelKey: 'copilot.history.filter.research' },
  { key: 'current_entity', labelKey: 'copilot.history.filter.currentEntity' },
  { key: 'draft_cleanup', labelKey: 'copilot.history.filter.draftCleanup' },
] as const

interface CopilotSessionHistoryProps {
  novelId: number
  onRestore: (item: CopilotSessionListItem) => void
  onBack: () => void
}

function relativeTime(dateStr: string | null, locale: string): string {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  const now = Date.now()
  const diff = now - date.getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return locale === 'zh' ? '刚刚' : 'just now'
  if (minutes < 60) return locale === 'zh' ? `${minutes} 分钟前` : `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return locale === 'zh' ? `${hours} 小时前` : `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return locale === 'zh' ? `${days} 天前` : `${days}d ago`
  return date.toLocaleDateString(locale === 'zh' ? 'zh-CN' : 'en-US', { month: 'short', day: 'numeric' })
}

export function CopilotSessionHistory({ novelId, onRestore, onBack }: CopilotSessionHistoryProps) {
  const { locale, t } = useUiLocale()
  const [items, setItems] = useState<CopilotSessionListItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [modeFilter, setModeFilter] = useState<ModeFilter>('all')
  const [restoringId, setRestoringId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setPage(1)
    setLoading(true)
    const params: { page: number; page_size: number; mode?: string } = { page: 1, page_size: 15 }
    if (modeFilter !== 'all') params.mode = modeFilter

    copilotApi.listSessions(novelId, params)
      .then((resp) => {
        if (cancelled) return
        setItems(resp.items)
        setTotal(resp.total)
        setPage(resp.page)
        setTotalPages(resp.total_pages)
      })
      .catch(() => {
        if (cancelled) return
        setItems([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [novelId, modeFilter])

  const loadMore = useCallback(() => {
    if (loadingMore) return
    const nextPage = page + 1
    if (nextPage > totalPages) return
    setLoadingMore(true)
    const params: { page: number; page_size: number; mode?: string } = { page: nextPage, page_size: 15 }
    if (modeFilter !== 'all') params.mode = modeFilter

    copilotApi.listSessions(novelId, params)
      .then((resp) => {
        setItems((prev) => [...prev, ...resp.items])
        setTotal(resp.total)
        setPage(resp.page)
        setTotalPages(resp.total_pages)
      })
      .catch(() => {})
      .finally(() => setLoadingMore(false))
  }, [novelId, page, totalPages, modeFilter, loadingMore])

  const handleRestore = useCallback((item: CopilotSessionListItem) => {
    setRestoringId(item.session_id)
    onRestore(item)
  }, [onRestore])

  const activeModes = new Set(items.map((item) => item.mode))

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-3">
        <button
          type="button"
          onClick={onBack}
          className={cn(
            'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:text-foreground',
            copilotPillInteractiveClassName,
          )}
          aria-label={t('copilot.drawer.close')}
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="min-w-0">
          <div className="text-[13px] font-medium text-foreground/90">{t('copilot.history.title')}</div>
          <div className="mt-0.5 text-[10px] text-muted-foreground/70">
            {t('copilot.drawer.sessionsCount', { count: total })}
          </div>
        </div>
      </div>

      {/* Mode filter pills */}
      <div className="flex flex-wrap items-center gap-1.5 px-5 pb-3">
        {MODE_FILTERS.map(({ key, labelKey }) => {
          if (key !== 'all' && !activeModes.has(key) && items.length > 0) return null
          const isActive = modeFilter === key
          return (
            <button
              key={key}
              type="button"
              onClick={() => setModeFilter(key)}
              className={cn(
                'inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.14em] transition-colors duration-150',
                isActive
                  ? 'bg-[var(--nw-copilot-pill-hover-bg)] text-foreground/85 border border-[var(--nw-copilot-border-strong)]'
                  : 'text-muted-foreground/75 border border-transparent',
                copilotPillClassName,
                !isActive && copilotPillInteractiveClassName,
              )}
            >
              {t(labelKey)}
            </button>
          )
        })}
      </div>

      {/* Content */}
      <div className="nw-scrollbar-thin min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        {loading && items.length === 0 && (
          <div className="flex items-center justify-center py-12 text-muted-foreground/60">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        )}

        {!loading && items.length === 0 && (
          <div className={cn(copilotPanelClassName, 'rounded-[20px] px-4 py-8 text-center')}>
            <Clock3 className="mx-auto h-8 w-8 text-muted-foreground/40" />
            <div className="mt-3 text-[13px] text-muted-foreground/70">{t('copilot.history.empty')}</div>
            <div className="mt-1 text-[11px] text-muted-foreground/50">{t('copilot.history.emptyHint')}</div>
          </div>
        )}

        <div className="space-y-2.5">
          {items.map((item) => (
            <button
              key={item.session_id}
              type="button"
              onClick={() => handleRestore(item)}
              disabled={restoringId === item.session_id}
              className={cn(
                'group w-full rounded-[20px] p-3.5 text-left transition-colors duration-150',
                copilotPanelClassName,
                'hover:border-[var(--nw-copilot-border-strong)]',
                restoringId === item.session_id && 'opacity-60',
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-medium text-foreground/90">
                    {item.display_title}
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <span className={cn(
                      'inline-flex items-center rounded-full px-1.5 py-px text-[9px] font-medium uppercase tracking-[0.14em] text-muted-foreground/75',
                      copilotPillClassName,
                    )}>
                      {t(`copilot.history.mode.${item.mode}` as 'copilot.history.mode.research')}
                    </span>
                    <span className={cn(
                      'inline-flex items-center rounded-full px-1.5 py-px text-[9px] font-medium uppercase tracking-[0.14em] text-muted-foreground/65',
                      copilotPillClassName,
                    )}>
                      {t(`copilot.history.scope.${item.scope}` as 'copilot.history.scope.whole_book')}
                    </span>
                    {item.run_count > 0 && (
                      <span className="text-[10px] text-muted-foreground/60">
                        {t('copilot.history.runs', { count: item.run_count })}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  {item.latest_run_status && (
                    <span className={cn(
                      'inline-flex h-2 w-2 rounded-full shrink-0',
                      item.latest_run_status === 'completed' && 'bg-[hsl(var(--color-success))]',
                      item.latest_run_status === 'error' && 'bg-[hsl(var(--color-danger))]',
                      item.latest_run_status === 'interrupted' && 'bg-[hsl(var(--color-warning))]',
                      (item.latest_run_status === 'queued' || item.latest_run_status === 'running') && 'bg-[hsl(var(--color-info))]',
                    )} />
                  )}
                  <span className="text-[10px] text-muted-foreground/55">
                    {relativeTime(item.last_active_at, locale)}
                  </span>
                </div>
              </div>
            </button>
          ))}
        </div>

        {/* Load more */}
        {page < totalPages && (
          <div className="mt-4 flex justify-center">
            <button
              type="button"
              onClick={loadMore}
              disabled={loadingMore}
              className={cn(
                'inline-flex items-center gap-2 rounded-full px-4 py-2 text-[11px] font-medium text-muted-foreground/75',
                copilotPillInteractiveClassName,
                loadingMore && 'opacity-50',
              )}
            >
              {loadingMore ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" />
                  {t('copilot.history.loading')}
                </>
              ) : (
                t('copilot.history.loadMore')
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
