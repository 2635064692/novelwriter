// SPDX-FileCopyrightText: 2026 Isaac.X.Ω.Yuan
// SPDX-License-Identifier: AGPL-3.0-only

import { cn } from '@/lib/utils'
import type { PromptVariable } from '@/types/prompts'

export function PromptVariablesTableTab({
  variables,
}: {
  variables: PromptVariable[]
}) {
  if (variables.length === 0) {
    return <p className="text-sm text-muted-foreground py-4">此模板没有定义变量。</p>
  }

  return (
    <div className="overflow-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--nw-glass-border)]">
            <th className="text-left py-2 pr-4 font-medium text-muted-foreground">变量名</th>
            <th className="text-left py-2 pr-4 font-medium text-muted-foreground">描述</th>
            <th className="text-left py-2 font-medium text-muted-foreground">必填</th>
          </tr>
        </thead>
        <tbody>
          {variables.map((v) => (
            <tr key={v.name} className="border-b border-[var(--nw-glass-border)]/50">
              <td className="py-2.5 pr-4">
                <code className="text-xs font-mono text-accent bg-accent/5 px-1.5 py-0.5 rounded">
                  {`{${v.name}}`}
                </code>
              </td>
              <td className="py-2.5 pr-4 text-muted-foreground">{v.description}</td>
              <td className="py-2.5">
                <span
                  className={cn(
                    'text-[11px] px-1.5 py-0.5 rounded',
                    v.requirement === 'required'
                      ? 'text-[hsl(var(--color-danger))] bg-[hsl(var(--color-danger)/0.08)]'
                      : 'text-muted-foreground',
                  )}
                >
                  {v.requirement === 'required' ? '必填' : '可选'}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
