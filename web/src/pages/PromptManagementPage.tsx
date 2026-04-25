// SPDX-FileCopyrightText: 2026 Isaac.X.Ω.Yuan
// SPDX-License-Identifier: AGPL-3.0-only

import { useState, useMemo, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { PageShell } from '@/components/layout/PageShell'
import { usePromptTemplates, useUpdatePromptTemplate } from '@/hooks/prompts/usePromptTemplates'
import { PromptToolbar } from '@/components/prompts/PromptToolbar'
import { PromptCategoryTabs } from '@/components/prompts/PromptCategoryTabs'
import { PromptCardGrid } from '@/components/prompts/PromptCardGrid'
import { PromptEditorDialog } from '@/components/prompts/PromptEditorDialog'
import { PROMPT_CATEGORY_OPTIONS, type PromptCategory, type PromptTemplate } from '@/types/prompts'

export function PromptManagementPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { data: templates = [], isLoading } = usePromptTemplates()
  const updateTemplate = useUpdatePromptTemplate()

  const activeCategory = parseCategory(searchParams.get('category')) ?? 'all'
  const searchQuery = searchParams.get('q') ?? ''

  const [selectedTemplate, setSelectedTemplate] = useState<PromptTemplate | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const opt of PROMPT_CATEGORY_OPTIONS) {
      counts[opt.value] = opt.value === 'all'
        ? templates.length
        : templates.filter((t) => t.category === opt.value).length
    }
    return counts
  }, [templates])

  const filteredTemplates = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    return templates.filter((t) => {
      if (activeCategory !== 'all' && t.category !== activeCategory) return false
      if (!query) return true
      const searchable = [t.title, t.description, t.key, ...t.tags, ...t.variables.map((v) => v.name)]
        .join(' ').toLowerCase()
      return searchable.includes(query)
    })
  }, [templates, activeCategory, searchQuery])

  const handleCategoryChange = useCallback((category: PromptCategory) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (category === 'all') next.delete('category')
      else next.set('category', category)
      return next
    }, { replace: true })
  }, [setSearchParams])

  const handleSearchQueryChange = useCallback((value: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (value.trim()) next.set('q', value)
      else next.delete('q')
      return next
    }, { replace: true })
  }, [setSearchParams])

  const handleEditTemplate = useCallback((template: PromptTemplate) => {
    setSelectedTemplate(template)
    setEditorOpen(true)
  }, [])

  const handleSave = useCallback((template: PromptTemplate) => {
    updateTemplate.mutate({ id: template.id, data: { content: template.content } })
  }, [updateTemplate])

  return (
    <PageShell className="h-screen" navbarProps={{ position: 'static' }} mainClassName="overflow-hidden">
      <div className="flex flex-col flex-1 px-12 py-10 gap-6 overflow-auto">
        {/* Header */}
        <div className="flex flex-col gap-1">
          <h1 className="m-0 font-mono text-2xl font-bold text-foreground">提示词管理</h1>
          <p className="m-0 text-sm text-muted-foreground">
            管理和编辑系统提示词模板
          </p>
        </div>

        {/* Toolbar */}
        <PromptToolbar
          searchQuery={searchQuery}
          onSearchQueryChange={handleSearchQueryChange}
          onCreateClick={() => {}}
        />

        {/* Category Tabs */}
        <PromptCategoryTabs
          activeCategory={activeCategory}
          counts={categoryCounts}
          onChange={handleCategoryChange}
        />

        {/* Card Grid */}
        <PromptCardGrid
          templates={filteredTemplates}
          loading={isLoading}
          onEditTemplate={handleEditTemplate}
        />
      </div>

      {/* Editor Dialog */}
      <PromptEditorDialog
        template={selectedTemplate}
        open={editorOpen}
        onOpenChange={setEditorOpen}
        onSave={handleSave}
      />
    </PageShell>
  )
}

function parseCategory(value: string | null): PromptCategory | null {
  if (!value) return null
  const valid: PromptCategory[] = ['all', 'continuation', 'outline', 'world', 'bootstrap']
  return valid.includes(value as PromptCategory) ? (value as PromptCategory) : null
}
