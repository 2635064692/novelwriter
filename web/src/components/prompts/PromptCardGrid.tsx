// SPDX-FileCopyrightText: 2026 Isaac.X.Ω.Yuan
// SPDX-License-Identifier: AGPL-3.0-only

import { GlassCard } from '@/components/GlassCard'
import { PromptCard } from './PromptCard'
import type { PromptTemplate } from '@/types/prompts'

export function PromptCardGrid({
  templates,
  loading,
  onEditTemplate,
}: {
  templates: PromptTemplate[]
  loading: boolean
  onEditTemplate: (template: PromptTemplate) => void
}) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <GlassCard key={i} className="h-48 animate-pulse" />
        ))}
      </div>
    )
  }

  if (templates.length === 0) {
    return (
      <div className="text-center py-16 text-sm text-muted-foreground">
        没有找到匹配的提示词
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {templates.map((template) => (
        <PromptCard
          key={template.id}
          template={template}
          onClick={() => onEditTemplate(template)}
        />
      ))}
    </div>
  )
}
