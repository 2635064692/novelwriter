import { useState, useRef, useEffect } from 'react'
import { ArrowUp, Square } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useUiLocale } from '@/contexts/UiLocaleContext'
import { copilotPanelStrongClassName } from './novelCopilotChrome'

export function NovelCopilotComposer({
  onSubmit,
  onCancel,
  disabled = false,
  isBusy = false,
  label,
  placeholder,
}: {
  onSubmit: (text: string) => void
  onCancel?: () => void
  disabled?: boolean
  isBusy?: boolean
  label?: string
  placeholder?: string
}) {
  const { t } = useUiLocale()
  const [value, setValue] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const resolvedLabel = label ?? t('copilot.composer.defaultLabel')
  const resolvedPlaceholder = placeholder ?? t('copilot.composer.defaultPlaceholder')

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (value.trim()) {
        onSubmit(value.trim())
        setValue('')
      }
    }
  }

  // Auto-resize
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`
    }
  }, [value])

  return (
    <div className="relative group">
      <div className="absolute -inset-1 rounded-[24px] bg-[radial-gradient(circle_at_top_right,hsl(var(--foreground)/0.15),transparent_60%)] opacity-30 blur-2xl transition duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] group-focus-within:opacity-60" />
      <div className={cn('relative rounded-[24px] p-2 transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] focus-within:border-[hsl(var(--foreground)/0.14)] focus-within:shadow-[0_12px_40px_rgba(0,0,0,0.08),0_4px_12px_rgba(0,0,0,0.04)]', copilotPanelStrongClassName)}>
        <div className="mb-2 flex items-center justify-between gap-3 px-2 pt-1">
          <div className="text-[10px] font-medium uppercase tracking-[0.2em] text-foreground/80">
            {resolvedLabel}
          </div>
          <div className="text-[10px] text-muted-foreground/60">
            {t('copilot.composer.sendHint')}
          </div>
        </div>
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            placeholder={resolvedPlaceholder}
            className="max-h-[120px] min-h-[44px] w-full resize-none bg-transparent px-2 py-2 text-sm leading-6 text-foreground placeholder:text-muted-foreground/50 focus:outline-none scrollbar-hide disabled:cursor-not-allowed disabled:opacity-60"
            rows={1}
          />
          {isBusy ? (
            <button
              type="button"
              onClick={onCancel}
              className={cn(
                'mb-1 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-[hsl(var(--color-danger)/0.3)] bg-[hsl(var(--color-danger)/0.9)] text-white shadow-[0_4px_12px_rgba(0,0,0,0.08)] transition-all duration-300 hover:bg-[hsl(var(--color-danger)/0.8)] active:scale-[0.97]',
              )}
              aria-label={t('copilot.drawer.cancel')}
            >
              <Square className="h-3.5 w-3.5 fill-current" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                if (value.trim()) {
                  onSubmit(value.trim())
                  setValue('')
                }
              }}
              disabled={disabled || !value.trim()}
              className={cn(
                'mb-1 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-[hsl(var(--foreground)/0.12)] bg-foreground text-background shadow-[0_4px_12px_rgba(0,0,0,0.08)] transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] hover:bg-foreground/90 hover:shadow-[0_8px_24px_rgba(0,0,0,0.12),0_2px_8px_rgba(0,0,0,0.04)] hover:-translate-y-[1px] active:scale-[0.97] active:duration-150 disabled:opacity-50 disabled:grayscale disabled:hover:-translate-y-0 disabled:hover:shadow-none',
              )}
              aria-label={t('copilot.composer.send')}
            >
              <ArrowUp className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
