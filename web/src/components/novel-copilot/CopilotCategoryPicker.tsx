import { Bot, X, Search, BookOpen } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useUiLocale } from '@/contexts/UiLocaleContext'
import {
  copilotPanelClassName,
} from './novelCopilotChrome'

function CategoryCard({
  icon: Icon,
  iconClassName,
  title,
  description,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>
  iconClassName: string
  title: string
  description: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        copilotPanelClassName,
        'flex items-center gap-4 rounded-[16px] border-[var(--nw-copilot-border)] px-4 py-5 text-left',
        'transition-all duration-200 hover:border-[--nw-copilot-border-strong] hover:shadow-[var(--nw-copilot-pill-hover-shadow)]',
      )}
    >
      <div
        className={cn(
          'flex h-12 w-12 shrink-0 items-center justify-center rounded-[22px]',
          iconClassName,
        )}
      >
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-semibold text-foreground/95">{title}</div>
        <div className="mt-1 text-[11px] leading-[1.15rem] text-muted-foreground/76">{description}</div>
      </div>
    </button>
  )
}

export function CopilotCategoryPicker({
  onSelect,
  onClose,
}: {
  onSelect: (category: 'whole_book' | 'outline') => void
  onClose: () => void
}) {
  const { t } = useUiLocale()

  return (
    <div className="relative flex h-full flex-col bg-[var(--nw-copilot-shell-bg)]">
      <div className="shrink-0 border-b border-[var(--nw-copilot-border)] bg-[linear-gradient(180deg,hsl(var(--background)/0.16),transparent)]">
        <div className="relative flex items-center justify-between gap-4 px-5 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[18px] bg-[var(--nw-copilot-panel-bg)] text-foreground/82 shadow-[var(--nw-copilot-panel-muted-shadow)]">
              <Bot className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-medium tracking-[0.01em] text-foreground/90">Novel Copilot</h2>
              <p className="mt-0.5 text-[11px] text-muted-foreground/70">
                {t('copilot.category.subtitle')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[18px] text-muted-foreground hover:text-foreground bg-[var(--nw-copilot-panel-muted-bg)] transition-colors"
            aria-label="Close Copilot"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-5">
        <h3 className="mb-3 text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground/70">
          {t('copilot.category.title')}
        </h3>
        <div className="space-y-3">
          <CategoryCard
            icon={Search}
            iconClassName="bg-[hsl(var(--accent)/0.12)] text-accent-foreground ring-1 ring-[hsl(var(--accent)/0.20)]"
            title={t('copilot.category.wholeBook.title')}
            description={t('copilot.category.wholeBook.description')}
            onClick={() => onSelect('whole_book')}
          />
          <CategoryCard
            icon={BookOpen}
            iconClassName="bg-[hsl(270_80%_65%/0.10)] text-[hsl(270_80%_65%)] ring-1 ring-[hsl(270_80%_65%/0.20)]"
            title={t('copilot.category.outline.title')}
            description={t('copilot.category.outline.description')}
            onClick={() => onSelect('outline')}
          />
        </div>
      </div>
    </div>
  )
}
