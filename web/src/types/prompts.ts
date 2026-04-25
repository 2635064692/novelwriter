// SPDX-FileCopyrightText: 2026 Isaac.X.Ω.Yuan
// SPDX-License-Identifier: AGPL-3.0-only

export type PromptKey =
  | 'system'
  | 'continuation'
  | 'outline'
  | 'world_gen_system'
  | 'world_gen'
  | 'bootstrap_refinement'

export type PromptCategory = 'all' | 'continuation' | 'outline' | 'world' | 'bootstrap'
export type PromptTemplateCategory = Exclude<PromptCategory, 'all'>
export type PromptOrigin = 'built_in' | 'custom'
export type PromptVariableRequirement = 'required' | 'optional'

export interface PromptVariable {
  name: string
  description: string
  requirement: PromptVariableRequirement
}

export interface PromptVersion {
  id: string
  version: number
  createdAt: string
  summary: string
  contentPreview: string
}

export interface PromptTemplate {
  id: string
  key: PromptKey
  title: string
  description: string
  category: PromptTemplateCategory
  origin: PromptOrigin
  content: string
  variables: PromptVariable[]
  versions: PromptVersion[]
  tags: string[]
  updatedAt: string
  enabled: boolean
}

export interface PromptCategoryOption {
  value: PromptCategory
  label: string
  keys: PromptKey[]
}

export interface CreatePromptInput {
  key: PromptKey
  title: string
  description: string
  category: PromptTemplateCategory
  content: string
  variables?: PromptVariable[]
  tags?: string[]
  enabled?: boolean
}

export const PROMPT_CATEGORY_OPTIONS: PromptCategoryOption[] = [
  { value: 'all', label: '全部', keys: ['system', 'continuation', 'outline', 'world_gen_system', 'world_gen', 'bootstrap_refinement'] },
  { value: 'continuation', label: '续写', keys: ['system', 'continuation'] },
  { value: 'outline', label: '大纲', keys: ['outline'] },
  { value: 'world', label: '世界观', keys: ['world_gen_system', 'world_gen'] },
  { value: 'bootstrap', label: '引导', keys: ['bootstrap_refinement'] },
]
