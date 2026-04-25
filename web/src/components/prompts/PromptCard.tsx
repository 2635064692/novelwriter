// SPDX-FileCopyrightText: 2026 Isaac.X.Ω.Yuan
// SPDX-License-Identifier: AGPL-3.0-only

import { GlassCard } from '@/components/GlassCard'
import { cn } from '@/lib/utils'
import type { PromptTemplate } from '@/types/prompts'

export function PromptCard({
  template,
  onClick,
}: {
  template: PromptTemplate
  onClick: () => void
}) {
  return (
    <GlassCard
      hoverable
      className={cn(
        'cursor-pointer flex flex-col gap-3 p-5',
        template.origin === 'built_in' ? 'border-l-4 border-l-accent/30' : 'border-l-4 border-l-[hsl(var(--color-warning)/0.4)]',
      )}
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold text-foreground leading-tight">{template.title}</h3>
        <span
          className={cn(
            'shrink-0 text-[10px] px-2 py-0.5 rounded-full border font-medium',
            template.origin === 'built_in'
              ? 'bg-accent/10 text-accent border-accent/20'
              : 'bg-[hsl(var(--color-warning)/0.10)] text-[hsl(var(--color-warning))] border-[hsl(var(--color-warning)/0.20)]',
          )}
        >
          {template.origin === 'built_in' ? '内置' : '自定义'}
        </span>
      </div>

      <code className="text-[11px] text-muted-foreground font-mono">{template.key}</code>

      <p className="text-sm text-muted-foreground line-clamp-2">{template.description}</p>

      {template.variables.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-auto pt-3">
          {template.variables.slice(0, 4).map((v) => (
            <span key={v.name} className="text-[10px] font-mono text-accent bg-accent/5 px-1.5 py-0.5 rounded">
              {`{${v.name}}`}
            </span>
          ))}
          {template.variables.length > 4 && (
            <span className="text-[10px] text-muted-foreground">+{template.variables.length - 4}</span>
          )}
        </div>
      )}

      <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
        <span>v{template.versions.length}</span>
        <span>·</span>
        <span>{template.tags.slice(0, 2).join(', ')}</span>
      </div>
    </GlassCard>
  )
}
