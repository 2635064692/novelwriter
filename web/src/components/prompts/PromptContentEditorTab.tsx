// SPDX-FileCopyrightText: 2026 Isaac.X.Ω.Yuan
// SPDX-License-Identifier: AGPL-3.0-only

import { Textarea } from '@/components/ui/textarea'

export function PromptContentEditorTab({
  content,
  onChange,
  readOnly,
}: {
  content: string
  onChange: (value: string) => void
  readOnly: boolean
}) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-foreground">提示词模板</label>
      <Textarea
        value={content}
        onChange={(e) => onChange(e.target.value)}
        readOnly={readOnly}
        className="min-h-[360px] font-mono text-sm bg-transparent border-[var(--nw-glass-border)] text-foreground placeholder:text-muted-foreground/70 focus-visible:ring-accent focus-visible:ring-offset-0 resize-y"
        placeholder="在此输入提示词，使用 {variable} 插入变量..."
      />
      {readOnly && (
        <p className="text-[11px] text-muted-foreground">
          内置模板不可直接修改。可复制为自定义模板后编辑。
        </p>
      )}
    </div>
  )
}
