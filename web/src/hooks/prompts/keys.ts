// SPDX-FileCopyrightText: 2026 Isaac.X.Ω.Yuan
// SPDX-License-Identifier: AGPL-3.0-only

export const promptKeys = {
  all: ['prompts'] as const,
  templates: () => ['prompts', 'templates'] as const,
  detail: (id: string) => ['prompts', 'templates', id] as const,
  versions: (id: string) => ['prompts', 'templates', id, 'versions'] as const,
}
