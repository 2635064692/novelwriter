// SPDX-FileCopyrightText: 2026 Isaac.X.Ω.Yuan
// SPDX-License-Identifier: AGPL-3.0-only

import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'

export function PromptToolbar({
  searchQuery,
  onSearchQueryChange,
}: {
  searchQuery: string
  onSearchQueryChange: (value: string) => void
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={searchQuery}
          onChange={(e) => onSearchQueryChange(e.target.value)}
          placeholder="搜索名称 / 键 / 描述 / 标签..."
          className="w-72 pl-9 bg-transparent border-[var(--nw-glass-border)] text-sm"
        />
      </div>
      <p className="text-xs text-muted-foreground">
        当前对接后端 6 个系统提示词；自定义模板创建待后端 API 支持。
      </p>
    </div>
  )
}
