// SPDX-FileCopyrightText: 2026 Isaac.X.Ω.Yuan
// SPDX-License-Identifier: AGPL-3.0-only

import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { PROMPT_CATEGORY_OPTIONS, type PromptCategory } from '@/types/prompts'

export function PromptCategoryTabs({
  activeCategory,
  counts,
  onChange,
}: {
  activeCategory: PromptCategory
  counts: Record<string, number>
  onChange: (category: PromptCategory) => void
}) {
  return (
    <Tabs value={activeCategory} onValueChange={(v) => onChange(v as PromptCategory)}>
      <TabsList className="bg-[var(--nw-glass-bg)] border border-[var(--nw-glass-border)] gap-1">
        {PROMPT_CATEGORY_OPTIONS.map((opt) => (
          <TabsTrigger
            key={opt.value}
            value={opt.value}
            className={cn(
              'text-xs px-3 py-1.5',
              activeCategory === opt.value
                ? 'bg-accent text-accent-foreground shadow-sm rounded-sm'
                : 'hover:bg-[var(--nw-glass-bg-hover)]',
            )}
          >
            {opt.label}
            <span className="ml-1 opacity-60">({counts[opt.value] ?? 0})</span>
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}
