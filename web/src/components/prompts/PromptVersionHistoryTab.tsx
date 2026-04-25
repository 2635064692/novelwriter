// SPDX-FileCopyrightText: 2026 Isaac.X.Ω.Yuan
// SPDX-License-Identifier: AGPL-3.0-only

import { cn } from '@/lib/utils'
import type { PromptVersion } from '@/types/prompts'

export function PromptVersionHistoryTab({
  versions,
  onRestore,
}: {
  versions: PromptVersion[]
  onRestore: (version: PromptVersion) => void
}) {
  const sorted = [...versions].sort((a, b) => b.version - a.version)

  if (sorted.length === 0) {
    return <p className="text-sm text-muted-foreground py-4">暂无版本记录。</p>
  }

  return (
    <div className="space-y-3">
      {sorted.map((v, idx) => (
        <div
          key={v.id}
          className={cn(
            'flex items-start justify-between gap-4 p-3 rounded-xl border border-[var(--nw-glass-border)]',
            idx === 0 && 'bg-[var(--nw-glass-bg)]',
          )}
        >
          <div className="flex-1 min-w-0 space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-foreground">v{v.version}</span>
              {idx === 0 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/10 text-accent">
                  当前
                </span>
              )}
              <span className="text-[11px] text-muted-foreground">
                {new Date(v.createdAt).toLocaleString('zh-CN')}
              </span>
            </div>
            <p className="text-sm text-foreground">{v.summary}</p>
            <p className="text-xs text-muted-foreground line-clamp-2">{v.contentPreview}</p>
          </div>
          {idx > 0 && (
            <button
              onClick={() => onRestore(v)}
              className="shrink-0 text-[11px] text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded hover:bg-[var(--nw-glass-bg-hover)]"
            >
              恢复
            </button>
          )}
        </div>
      ))}
    </div>
  )
}
