// SPDX-FileCopyrightText: 2026 Isaac.X.Ω.Yuan
// SPDX-License-Identifier: AGPL-3.0-only

import type { PromptTemplate, PromptVariable } from '@/types/prompts'

const continuationVars: PromptVariable[] = [
  { name: 'title', description: '小说标题', requirement: 'required' },
  { name: 'next_chapter_reference', description: '待续章节引用', requirement: 'required' },
  { name: 'outline', description: '当前续写目标对应的大纲内容', requirement: 'required' },
  { name: 'world_context', description: '注入的世界观知识与人物关系', requirement: 'optional' },
  { name: 'narrative_constraints', description: '本次续写必须遵守的叙事约束', requirement: 'optional' },
]

const outlineVars: PromptVariable[] = [
  { name: 'start', description: '起始章节编号', requirement: 'required' },
  { name: 'end', description: '结束章节编号', requirement: 'required' },
  { name: 'content', description: '用于提炼大纲的章节正文', requirement: 'required' },
]

const worldGenVars: PromptVariable[] = [
  { name: 'chunk_directive', description: '分块处理时的覆盖率或范围指令', requirement: 'optional' },
  { name: 'text', description: '待抽取的世界观设定文本', requirement: 'required' },
]

const bootstrapVars: PromptVariable[] = [
  { name: 'candidate_lines', description: '候选词列表（名称: 出现窗口数）', requirement: 'required' },
  { name: 'pair_lines', description: '候选词共现对列表', requirement: 'required' },
]

export const mockPromptTemplates: PromptTemplate[] = [
  {
    id: 'builtin-system',
    key: 'system',
    title: '续写系统提示词',
    description: '约束续写任务的角色一致性、视角纪律、反幻觉规则和输出格式。',
    category: 'continuation',
    origin: 'built_in',
    content: '你是一位专业的小说续写作家。\n\n【核心规则】\n1. 保持角色性格一致\n2. 情节自然推进，避免突兀转折\n3. 不要重复已有章节的内容\n4. 适当设置悬念与冲突\n5. 与上文展示的角色状态和人物关系保持一致\n\n【视角纪律 — 最高优先级】\n<world_knowledge> 给予你（作者）全知视角，但角色并不共享这些知识。\n\n【格式规则】\n- 不要输出章节标题，直接从正文开始\n- 不要输出分析、规划、思维链或元评论，只输出故事正文',
    variables: [],
    versions: [
      { id: 'builtin-system-v1', version: 1, createdAt: '2026-03-01T09:00:00Z', summary: '初始版本', contentPreview: '你是一位专业的小说续写作家...' },
    ],
    tags: ['核心', '续写'],
    updatedAt: '2026-03-01T09:00:00Z',
    enabled: true,
  },
  {
    id: 'builtin-continuation',
    key: 'continuation',
    title: '续写用户消息模板',
    description: '组合书名、待续章节、大纲、世界观上下文和叙事约束，生成续写请求。',
    category: 'continuation',
    origin: 'built_in',
    content: '<novel_info>\n书名：{title}\n待续章节：{next_chapter_reference}\n</novel_info>\n\n<outline>\n{outline}\n</outline>\n{world_context}\n{narrative_constraints}',
    variables: continuationVars,
    versions: [
      { id: 'builtin-continuation-v1', version: 1, createdAt: '2026-03-01T09:05:00Z', summary: '初始版本', contentPreview: '<novel_info> 书名：{title}...' },
    ],
    tags: ['核心', '续写'],
    updatedAt: '2026-03-01T09:05:00Z',
    enabled: true,
  },
  {
    id: 'builtin-outline',
    key: 'outline',
    title: '章节结构化大纲',
    description: '将指定章节范围的正文提炼为主线剧情、角色发展、伏笔和世界观拓展。',
    category: 'outline',
    origin: 'built_in',
    content: '请为以下章节生成结构化大纲。\n\n【章节范围】第{start}章 – 第{end}章\n\n【内容】\n{content}\n\n【大纲要求】\n请按以下格式输出：\n\n## 主线剧情\n- [列出3-5个关键情节点]\n\n## 角色发展\n- [主要角色的变化与成长]\n\n## 重要伏笔\n- [需要在后续章节中呼应的线索]\n\n## 世界观拓展\n- [新出现的设定或背景信息]\n\n请保持简洁，总字数300-500字。',
    variables: outlineVars,
    versions: [
      { id: 'builtin-outline-v1', version: 1, createdAt: '2026-03-01T09:10:00Z', summary: '初始版本', contentPreview: '请为第{start}章 – 第{end}章生成结构化大纲...' },
    ],
    tags: ['大纲', '结构化输出'],
    updatedAt: '2026-03-01T09:10:00Z',
    enabled: true,
  },
  {
    id: 'builtin-world-gen-system',
    key: 'world_gen_system',
    title: '世界观抽取系统提示词',
    description: '约束世界观整理任务，要求只提取文本明确支持的实体、关系和体系草稿。',
    category: 'world',
    origin: 'built_in',
    content: '你是一名资深的小说世界观整理编辑。\n\n你的任务是：从用户提供的"世界观设定文本"中提取结构化信息。\n\n原则：\n1) 以明确、稳定、可复用为先；不确定就不要写\n2) 不要编造文本中不存在的实体、关系或体系\n3) 关系有方向：source 表示主动方\n4) 仅输出 schema 允许的字段\n5) systems 应优先承载世界规则、组织制度、修炼体系等成组设定\n6) systems.display_type 只能使用 list、hierarchy、timeline 三种\n7) 不要输出 graph 或布局信息',
    variables: [],
    versions: [
      { id: 'builtin-world-gen-system-v1', version: 1, createdAt: '2026-03-01T09:15:00Z', summary: '初始版本', contentPreview: '你是一名资深的小说世界观整理编辑...' },
    ],
    tags: ['世界观', '系统提示词', '结构化抽取'],
    updatedAt: '2026-03-01T09:15:00Z',
    enabled: true,
  },
  {
    id: 'builtin-world-gen',
    key: 'world_gen',
    title: '世界观设定抽取',
    description: '从设定文本中抽取实体、关系和世界规则，生成世界模型草稿。',
    category: 'world',
    origin: 'built_in',
    content: '请阅读下面的世界观设定文本，并提取：\n- entities: 角色/地点/势力/组织/物品/概念中的"实体"\n- relationships: 实体之间的关系\n- systems: 世界规则/设定集合\n\n{chunk_directive}\n\n【世界观设定文本】\n{text}',
    variables: worldGenVars,
    versions: [
      { id: 'builtin-world-gen-v1', version: 1, createdAt: '2026-03-01T09:20:00Z', summary: '初始版本', contentPreview: '请阅读世界观设定文本，提取 entities...' },
    ],
    tags: ['世界观', '实体抽取'],
    updatedAt: '2026-03-01T09:20:00Z',
    enabled: true,
  },
  {
    id: 'builtin-bootstrap-refinement',
    key: 'bootstrap_refinement',
    title: '候选词世界观提炼',
    description: '从候选词和共现对中筛选高置信实体与关系，过滤噪声并合并别名。',
    category: 'bootstrap',
    origin: 'built_in',
    content: '你正在从一部小说的候选词中提炼出世界观实体和关系。\n\n## 输入\n\n候选词（名称: 出现窗口数）:\n{candidate_lines}\n\n共现对（名称A -- 名称B: 共现次数）:\n{pair_lines}\n\n## 任务\n\n1) 过滤噪声：去除动词、形容词、普通名词等非实体词\n2) 合并别名：同一角色/地点的不同称呼合并为一个实体\n3) 分类：entity_type 从 Character, Location, Item, Faction, Concept 中选择\n4) 关系标签必须具体有信息量，禁止「关联」「相关」等笼统词\n5) 只输出确信度高的实体和关系\n\n请直接返回完整 JSON。',
    variables: bootstrapVars,
    versions: [
      { id: 'builtin-bootstrap-v1', version: 1, createdAt: '2026-03-01T09:25:00Z', summary: '初始版本', contentPreview: '从候选词中提炼世界观实体和关系...' },
    ],
    tags: ['引导', '候选词', '别名合并'],
    updatedAt: '2026-03-01T09:25:00Z',
    enabled: true,
  },
  {
    id: 'custom-continuation-emotion',
    key: 'continuation',
    title: '情绪张力续写模板',
    description: '自定义续写模板，强调人物情绪递进、场景压迫感和章节末尾钩子。',
    category: 'continuation',
    origin: 'custom',
    content: '请基于《{title}》续写下一章节。\n\n<outline>\n{outline}\n</outline>\n\n{world_context}\n\n写作要求：\n1. 强化人物情绪张力，让冲突逐步升级\n2. 保留原作叙事口吻\n3. 章节结尾留下一个自然但明确的钩子\n\n{narrative_constraints}',
    variables: [continuationVars[0], continuationVars[2], continuationVars[3], continuationVars[4]],
    versions: [
      { id: 'custom-emotion-v1', version: 1, createdAt: '2026-03-04T10:00:00Z', summary: '创建强调冲突递进的续写模板', contentPreview: '请基于《{title}》续写下一章节，强化人物情绪张力...' },
      { id: 'custom-emotion-v2', version: 2, createdAt: '2026-03-05T14:30:00Z', summary: '补充章节结尾钩子要求', contentPreview: '强化人物情绪张力，让冲突逐步升级...' },
    ],
    tags: ['自定义', '续写', '情绪张力'],
    updatedAt: '2026-03-05T14:30:00Z',
    enabled: true,
  },
  {
    id: 'custom-world-factions',
    key: 'world_gen',
    title: '势力与地域优先抽取',
    description: '自定义世界观抽取模板，优先整理势力、地域层级、修炼体系和禁忌规则。',
    category: 'world',
    origin: 'custom',
    content: '{chunk_directive}\n\n请从以下文本中优先提取势力、地域、修炼体系与禁忌规则。\n\n输出重点：\n1. 势力之间的上下级、敌对、盟友和效忠关系\n2. 地域层级与重要地点归属\n3. 修炼体系、资源分类、禁忌规则等可复用 systems\n4. 如果文本证据不足，不要补全设定\n\n【原文】\n{text}',
    variables: worldGenVars,
    versions: [
      { id: 'custom-factions-v1', version: 1, createdAt: '2026-03-06T08:40:00Z', summary: '创建势力地域优先抽取模板', contentPreview: '请从文本中优先提取势力、地域、修炼体系...' },
      { id: 'custom-factions-v2', version: 2, createdAt: '2026-03-07T11:15:00Z', summary: '补充证据不足处理要求', contentPreview: '优先提取势力关系、地域层级...' },
    ],
    tags: ['自定义', '世界观', '势力关系'],
    updatedAt: '2026-03-07T11:15:00Z',
    enabled: true,
  },
]
