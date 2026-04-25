// SPDX-FileCopyrightText: 2026 Isaac.X.Ω.Yuan
// SPDX-License-Identifier: AGPL-3.0-only

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { promptKeys } from './keys'
import { mockPromptTemplates } from '@/mocks/prompts'
import type { CreatePromptInput, PromptTemplate, PromptVersion } from '@/types/prompts'

export interface UpdatePromptTemplateInput {
  id: string
  data: Partial<CreatePromptInput>
}

function createContentPreview(content: string): string {
  return content.trim().replace(/\s+/g, ' ').slice(0, 120)
}

function buildPromptTemplate(input: CreatePromptInput): PromptTemplate {
  const now = new Date().toISOString()
  const id = `prompt-custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  return {
    id,
    key: input.key,
    title: input.title,
    description: input.description,
    category: input.category,
    origin: 'custom',
    content: input.content,
    variables: input.variables ?? [],
    versions: [
      { id: `${id}-v1`, version: 1, createdAt: now, summary: '创建自定义提示词', contentPreview: createContentPreview(input.content) },
    ],
    tags: input.tags ?? [],
    updatedAt: now,
    enabled: input.enabled ?? true,
  }
}

export function usePromptTemplates() {
  return useQuery<PromptTemplate[]>({
    queryKey: promptKeys.templates(),
    queryFn: () => Promise.resolve(mockPromptTemplates),
    staleTime: Infinity,
  })
}

export function useCreatePromptTemplate() {
  const queryClient = useQueryClient()
  return useMutation<PromptTemplate, Error, CreatePromptInput>({
    mutationFn: (input) => Promise.resolve(buildPromptTemplate(input)),
    onSuccess: (created) => {
      queryClient.setQueryData<PromptTemplate[]>(
        promptKeys.templates(),
        (current = []) => [created, ...current],
      )
    },
  })
}

export function useUpdatePromptTemplate() {
  const queryClient = useQueryClient()
  return useMutation<PromptTemplate, Error, UpdatePromptTemplateInput>({
    mutationFn: ({ id, data }) => {
      const templates = queryClient.getQueryData<PromptTemplate[]>(promptKeys.templates())
      const current = templates?.find((t) => t.id === id)
      if (!current) return Promise.reject(new Error(`Template not found: ${id}`))
      const now = new Date().toISOString()
      const contentChanged = data.content !== undefined && data.content !== current.content
      const nextVersion = contentChanged
        ? Math.max(...current.versions.map((v) => v.version)) + 1
        : null
      const updated: PromptTemplate = {
        ...current,
        ...data,
        variables: data.variables ?? current.variables,
        versions: nextVersion != null && data.content !== undefined
          ? [...current.versions, { id: `${id}-v${nextVersion}`, version: nextVersion, createdAt: now, summary: '更新提示词内容', contentPreview: createContentPreview(data.content) }]
          : current.versions,
        tags: data.tags ?? current.tags,
        updatedAt: now,
      }
      return Promise.resolve(updated)
    },
    onSuccess: (updated) => {
      queryClient.setQueryData<PromptTemplate[]>(
        promptKeys.templates(),
        (current = []) => current.map((t) => (t.id === updated.id ? updated : t)),
      )
    },
  })
}
