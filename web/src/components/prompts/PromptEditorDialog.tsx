// SPDX-FileCopyrightText: 2026 Isaac.X.Ω.Yuan
// SPDX-License-Identifier: AGPL-3.0-only

import { useState } from 'react'
import { X } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { NwButton } from '@/components/ui/nw-button'
import { PromptContentEditorTab } from './PromptContentEditorTab'
import { PromptVariablesTableTab } from './PromptVariablesTableTab'
import { PromptVersionHistoryTab } from './PromptVersionHistoryTab'
import { cn } from '@/lib/utils'
import type { PromptTemplate, PromptVersion } from '@/types/prompts'

export function PromptEditorDialog({
  template,
  open,
  onOpenChange,
  onSave,
  onRestore,
}: {
  template: PromptTemplate | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (template: PromptTemplate) => void
  onRestore: (template: PromptTemplate, version: number) => void
}) {
  const [content, setContent] = useState('')
  const [activeTab, setActiveTab] = useState('content')

  if (!open || !template) return null

  const activeTemplate = template
  const isBuiltIn = activeTemplate.origin === 'built_in'
  const readOnly = false
  const currentContent = content || activeTemplate.content
  const isDirty = content !== '' && content !== activeTemplate.content

  function handleClose() {
    setContent('')
    setActiveTab('content')
    onOpenChange(false)
  }

  function handleSave() {
    onSave({ ...activeTemplate, content: currentContent })
    setContent('')
    onOpenChange(false)
  }

  function handleRestore(version: PromptVersion) {
    onRestore(activeTemplate, version.version)
    setContent('')
    setActiveTab('content')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={handleClose}>
      <div
        className="w-full max-w-4xl mx-4 max-h-[85vh] flex flex-col rounded-2xl border border-[var(--nw-glass-border-hover)] bg-[hsl(var(--nw-modal-bg))] backdrop-blur-[24px] shadow-[0_24px_80px_var(--nw-backdrop)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--nw-glass-border)]">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-foreground">{activeTemplate.title}</h2>
            <span
              className={cn(
                'text-[10px] px-2 py-0.5 rounded-full border font-medium',
                isBuiltIn
                  ? 'bg-accent/10 text-accent border-accent/20'
                  : 'bg-[hsl(var(--color-warning)/0.10)] text-[hsl(var(--color-warning))] border-[hsl(var(--color-warning)/0.20)]',
              )}
            >
              {isBuiltIn ? '内置' : '自定义'}
            </span>
          </div>
          <button onClick={handleClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Info bar */}
        <div className="px-6 py-2.5 text-[11px] text-muted-foreground border-b border-[var(--nw-glass-border)] bg-[var(--nw-glass-bg)]">
          <code className="font-mono mr-3">{activeTemplate.key}</code>
          <span>共 {activeTemplate.versions.length} 个版本</span>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 min-h-0 flex flex-col">
          <div className="px-6 pt-3 border-b border-[var(--nw-glass-border)]">
            <TabsList className="bg-transparent border-0 p-0 gap-4 h-auto">
              <TabsTrigger value="content" className="text-sm px-0 py-2 border-b-2 border-transparent data-[state=active]:border-accent data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none rounded-none">
                内容编辑
              </TabsTrigger>
              <TabsTrigger value="variables" className="text-sm px-0 py-2 border-b-2 border-transparent data-[state=active]:border-accent data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none rounded-none">
                变量配置
              </TabsTrigger>
              <TabsTrigger value="versions" className="text-sm px-0 py-2 border-b-2 border-transparent data-[state=active]:border-accent data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none rounded-none">
                版本历史 ({activeTemplate.versions.length})
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="content" className="flex-1 overflow-y-auto p-6">
            <PromptContentEditorTab
              content={currentContent}
              onChange={setContent}
              readOnly={readOnly}
            />
          </TabsContent>

          <TabsContent value="variables" className="flex-1 overflow-y-auto p-6">
            <PromptVariablesTableTab variables={activeTemplate.variables} />
          </TabsContent>

          <TabsContent value="versions" className="flex-1 overflow-y-auto p-6">
            <PromptVersionHistoryTab versions={activeTemplate.versions} onRestore={handleRestore} />
          </TabsContent>
        </Tabs>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-[var(--nw-glass-border)]">
          <p className="text-[11px] text-muted-foreground">
            {isDirty ? '修改后请点击保存' : '未做修改'}
          </p>
          <div className="flex items-center gap-3">
            <NwButton variant="ghost" onClick={handleClose}>取消</NwButton>
            <NwButton variant="accent" onClick={handleSave} disabled={!isDirty}>
              保存为新版本
            </NwButton>
          </div>
        </div>
      </div>
    </div>
  )
}
