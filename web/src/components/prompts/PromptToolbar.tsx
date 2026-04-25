// SPDX-FileCopyrightText: 2026 Isaac.X.Ω.Yuan
// SPDX-License-Identifier: AGPL-3.0-only

import { Search, Plus } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { NwButton } from '@/components/ui/nw-button'

export function PromptToolbar({
  searchQuery,
  onSearchQueryChange,
  onCreateClick,
}: {
  searchQuery: string
  onSearchQueryChange: (value: string) => void
  onCreateClick: () => void
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
      <NwButton
        variant="accent"
        onClick={onCreateClick}
        className="rounded-full px-5 py-2 text-sm font-medium"
      >
        <Plus size={16} />
        新建提示词
      </NwButton>
    </div>
  )
}
