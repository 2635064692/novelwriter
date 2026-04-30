// SPDX-FileCopyrightText: 2026 Isaac.X.Ω.Yuan
// SPDX-License-Identifier: AGPL-3.0-only

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { request } from '@/services/apiClient'
import { promptKeys } from './keys'
import type {
  CreatePromptInput,
  PromptKey,
  PromptRollbackDto,
  PromptTemplate,
  PromptTemplateCategory,
  PromptTemplateDto,
  PromptTemplateUpdateDto,
  PromptVariable,
  PromptVersion,
  PromptVersionDto,
} from '@/types/prompts'

export interface UpdatePromptTemplateInput {
  id: string
  data: Partial<CreatePromptInput> & { reason?: string }
}

export interface RollbackPromptTemplateInput {
  id: string
  version: number
  reason?: string
}

const PROMPT_META: Record<PromptKey, { title: string; category: PromptTemplateCategory; tags: string[]; description: string }> = {
  system: {
    title: '续写系统提示词',
    category: 'continuation',
    tags: ['核心', '续写'],
    description: '约束续写任务的角色一致性、视角纪律、反幻觉规则和输出格式。',
  },
  continuation: {
    title: '续写用户消息模板',
    category: 'continuation',
    tags: ['续写', '用户模板'],
    description: '组合书名、待续章节、大纲、世界观与叙事约束，生成续写请求。',
  },
  outline: {
    title: '大纲提炼提示词',
    category: 'outline',
    tags: ['大纲', '章节摘要'],
    description: '从章节正文中提炼指定范围的大纲与关键情节。',
  },
  world_gen_system: {
    title: '世界观生成系统提示词',
    category: 'world',
    tags: ['世界观', '系统'],
    description: '定义世界观抽取任务的结构化输出规则与边界。',
  },
  world_gen: {
    title: '世界观生成用户消息模板',
    category: 'world',
    tags: ['世界观', '抽取'],
    description: '从文本片段中抽取人物、地点、组织、设定与关系。',
  },
  bootstrap_refinement: {
    title: '世界观引导优化提示词',
    category: 'bootstrap',
    tags: ['引导', '候选词'],
    description: '根据候选词与共现关系优化世界观引导建议。',
  },
  volume_outline_gen: {
    title: '卷纲生成提示词',
    category: 'outline',
    tags: ['大纲', '卷纲'],
    description: '结合世界观与章节列表规划卷划分，并生成每卷卷纲。',
  },
  chapter_brief_gen: {
    title: '章纲生成提示词',
    category: 'outline',
    tags: ['大纲', '章纲'],
    description: '基于已确认卷纲分批生成章纲、悬念密度与认知颠覆等级。',
  },
}

const VARIABLE_DESCRIPTIONS: Record<string, string> = {
  title: '小说标题',
  next_chapter_reference: '待续章节引用',
  outline: '当前续写目标对应的大纲内容',
  world_context: '注入的世界观知识与人物关系',
  narrative_constraints: '本次续写必须遵守的叙事约束',
  start: '起始章节编号',
  end: '结束章节编号',
  content: '用于提炼大纲的章节正文',
  chunk_directive: '分块处理时的覆盖率或范围指令',
  text: '待抽取的世界观设定文本',
  candidate_lines: '候选词列表（名称: 出现窗口数）',
  pair_lines: '候选词共现对列表',
  chapter_list: '用于规划卷划分的章节列表',
  total_chapters: '小说总章节数',
  total_volumes_hint: '用户提供的总卷数建议',
  user_guidance: '用户追加的生成指导',
  volume_number: '当前生成的卷号',
  volume_title: '当前卷标题',
  volume_outline: '当前卷的卷纲文本',
  chapter_start: '当前卷的起始章节号',
  chapter_end: '当前卷的结束章节号',
  chapter_contents: '当前批次章节内容或摘要',
  carry: '跨批次承接说明',
}

function createContentPreview(content: string): string {
  return content.trim().replace(/\s+/g, ' ').slice(0, 120)
}

function extractVariables(content: string): PromptVariable[] {
  const names = Array.from(content.matchAll(/\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g), (match) => match[1])
  return [...new Set(names)].sort().map((name) => ({
    name,
    description: VARIABLE_DESCRIPTIONS[name] ?? '后端模板占位符，保存时必须保持完整。',
    requirement: 'required',
  }))
}

function toPromptVersion(dto: PromptVersionDto): PromptVersion {
  const createdAt = dto.created_at ?? new Date(0).toISOString()
  return {
    id: String(dto.id),
    version: dto.version,
    createdAt,
    summary: dto.reason || `由 ${dto.operator} 保存的历史快照`,
    content: dto.template,
    contentPreview: createContentPreview(dto.template),
  }
}

function toPromptTemplate(dto: PromptTemplateDto, versions: PromptVersionDto[] = []): PromptTemplate {
  const meta = PROMPT_META[dto.key]
  const updatedAt = dto.updated_at ?? dto.created_at ?? new Date(0).toISOString()
  const currentVersion: PromptVersion = {
    id: `${dto.id}-current`,
    version: dto.version,
    createdAt: updatedAt,
    summary: '当前数据库版本',
    content: dto.template,
    contentPreview: createContentPreview(dto.template),
    current: true,
  }

  return {
    id: dto.key,
    key: dto.key,
    title: meta.title,
    description: dto.description || meta.description,
    category: meta.category,
    origin: dto.built_in ? 'built_in' : 'custom',
    content: dto.template,
    variables: extractVariables(dto.template),
    versions: [currentVersion, ...versions.map(toPromptVersion)],
    tags: meta.tags,
    updatedAt,
    enabled: true,
  }
}

async function listPromptTemplates(): Promise<PromptTemplate[]> {
  const templates = await request<PromptTemplateDto[]>('/api/prompts/')
  const withVersions = await Promise.all(templates.map(async (template) => {
    const versions = await request<PromptVersionDto[]>(`/api/prompts/${encodeURIComponent(template.key)}/versions`)
    return toPromptTemplate(template, versions)
  }))
  return withVersions.sort((a, b) => a.title.localeCompare(b.title, 'zh-CN'))
}

async function updatePromptTemplate({ id, data }: UpdatePromptTemplateInput): Promise<PromptTemplate> {
  if (data.content == null) throw new Error('Prompt template content is required')
  const payload: PromptTemplateUpdateDto = {
    template: data.content,
    reason: data.reason ?? '前端提示词管理保存',
  }
  const updated = await request<PromptTemplateDto>(`/api/prompts/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
  const versions = await request<PromptVersionDto[]>(`/api/prompts/${encodeURIComponent(updated.key)}/versions`)
  return toPromptTemplate(updated, versions)
}

async function rollbackPromptTemplate({ id, version, reason }: RollbackPromptTemplateInput): Promise<PromptTemplate> {
  const payload: PromptRollbackDto = {
    version,
    reason: reason ?? `前端回滚到 v${version}`,
  }
  const updated = await request<PromptTemplateDto>(`/api/prompts/${encodeURIComponent(id)}/rollback`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  const versions = await request<PromptVersionDto[]>(`/api/prompts/${encodeURIComponent(updated.key)}/versions`)
  return toPromptTemplate(updated, versions)
}

export function usePromptTemplates() {
  return useQuery<PromptTemplate[]>({
    queryKey: promptKeys.templates(),
    queryFn: listPromptTemplates,
    staleTime: 30_000,
  })
}

export function useCreatePromptTemplate() {
  return useMutation<PromptTemplate, Error, CreatePromptInput>({
    mutationFn: () => Promise.reject(new Error('Custom prompt creation is not supported by the backend API yet')),
  })
}

export function useUpdatePromptTemplate() {
  const queryClient = useQueryClient()
  return useMutation<PromptTemplate, Error, UpdatePromptTemplateInput>({
    mutationFn: updatePromptTemplate,
    onSuccess: (updated) => {
      queryClient.setQueryData<PromptTemplate[]>(
        promptKeys.templates(),
        (current = []) => current.map((t) => (t.id === updated.id ? updated : t)),
      )
      void queryClient.invalidateQueries({ queryKey: promptKeys.templates() })
      void queryClient.invalidateQueries({ queryKey: promptKeys.versions(updated.id) })
    },
  })
}

export function useRollbackPromptTemplate() {
  const queryClient = useQueryClient()
  return useMutation<PromptTemplate, Error, RollbackPromptTemplateInput>({
    mutationFn: rollbackPromptTemplate,
    onSuccess: (updated) => {
      queryClient.setQueryData<PromptTemplate[]>(
        promptKeys.templates(),
        (current = []) => current.map((t) => (t.id === updated.id ? updated : t)),
      )
      void queryClient.invalidateQueries({ queryKey: promptKeys.templates() })
      void queryClient.invalidateQueries({ queryKey: promptKeys.versions(updated.id) })
    },
  })
}
