export interface Novel {
  id: number
  title: string
  author: string
  language: string
  total_chapters: number
  window_index?: WindowIndexState
  created_at: string
  updated_at: string
}

export type WindowIndexLifecycleStatus = 'missing' | 'stale' | 'fresh' | 'failed'
export type DerivedAssetJobStatus = 'queued' | 'running' | 'completed' | 'failed'

export interface WindowIndexJob {
  status: DerivedAssetJobStatus
  target_revision: number
  completed_revision: number | null
  error: string | null
}

export interface WindowIndexState {
  status: WindowIndexLifecycleStatus
  revision: number
  built_revision: number | null
  error: string | null
  job: WindowIndexJob | null
}

export interface ChapterMeta {
  id: number
  novel_id: number
  chapter_number: number
  title: string
  source_chapter_label: string | null
  source_chapter_number: number | null
  created_at: string
}

export interface Chapter {
  id: number
  novel_id: number
  chapter_number: number
  title: string
  source_chapter_label: string | null
  source_chapter_number: number | null
  content: string
  created_at: string
  updated_at: string | null
}

export interface ChapterCreateRequest {
  chapter_number?: number
  title?: string
  content?: string
}

export interface ChapterUpdateRequest {
  title?: string
  content?: string
}

export interface ContinueRequest {
  num_versions?: number
  prompt?: string
  max_tokens?: number
  target_chars?: number
  context_chapters?: number
  temperature?: number
}

export interface PostcheckWarning {
  code: string
  term: string
  message: string
  message_key: string
  message_params: Record<string, string | number | boolean | null>
  version: number | null
  evidence: string | null
}

export interface ProseWarning {
  code: string
  message: string
  message_key: string
  message_params: Record<string, string | number | boolean | null>
  version: number | null
  evidence: string | null
}

export interface ContinueDebugSummary {
  context_chapters: number
  injected_systems: string[]
  injected_entities: string[]
  injected_relationships: string[]
  relevant_entity_ids: number[]
  ambiguous_keywords_disabled: string[]
  drift_warnings: PostcheckWarning[]
  prose_warnings: ProseWarning[]
}

export interface Continuation {
  id: number
  novel_id: number
  chapter_number: number
  content: string
  rating: number | null
  created_at: string
}

export interface ContinueResponse {
  continuations: Continuation[]
  debug: ContinueDebugSummary
}

// World Model Types
export type Visibility = 'active' | 'reference' | 'hidden'
export type EntityStatus = 'draft' | 'confirmed'
export type SystemDisplayType = 'hierarchy' | 'timeline' | 'list' | 'outline'
export type LegacySystemDisplayType = SystemDisplayType | 'graph'
export type WorldOrigin = 'manual' | 'bootstrap' | 'worldpack' | 'worldgen'

export interface WorldEntity {
  id: number
  novel_id: number
  name: string
  entity_type: string
  description: string
  aliases: string[]
  origin: WorldOrigin
  worldpack_pack_id: string | null
  worldpack_key: string | null
  status: EntityStatus
  created_at: string
  updated_at: string
}

export interface WorldEntityAttribute {
  id: number
  entity_id: number
  key: string
  surface: string
  truth: string | null
  visibility: Visibility
  origin: WorldOrigin
  worldpack_pack_id: string | null
  sort_order: number
  created_at: string
  updated_at: string
}

export interface WorldEntityDetail extends WorldEntity {
  attributes: WorldEntityAttribute[]
}

export interface WorldRelationship {
  id: number
  novel_id: number
  source_id: number
  target_id: number
  label: string
  description: string
  visibility: Visibility
  origin: WorldOrigin
  worldpack_pack_id: string | null
  status: EntityStatus
  created_at: string
  updated_at: string
}

export interface WorldSystem {
  id: number
  novel_id: number
  name: string
  display_type: LegacySystemDisplayType
  description: string
  data: Record<string, unknown>
  constraints: string[]
  visibility: Visibility
  origin: WorldOrigin
  worldpack_pack_id: string | null
  status: EntityStatus
  created_at: string
  updated_at: string
}

export interface WorldGenerateRequest {
  text: string
}

export interface WorldGenerateWarning {
  code: string
  message: string
  message_key: string
  message_params: Record<string, string | number | boolean | null>
  path?: string | null
}

export interface WorldGenerateResponse {
  entities_created: number
  relationships_created: number
  systems_created: number
  warnings: WorldGenerateWarning[]
}

export interface CreateEntityRequest {
  name: string
  entity_type: string
  description?: string
  aliases?: string[]
}

export interface UpdateEntityRequest {
  name?: string
  entity_type?: string
  description?: string
  aliases?: string[]
}

export interface CreateAttributeRequest {
  key: string
  surface: string
  truth?: string
  visibility?: Visibility
}

export interface UpdateAttributeRequest {
  key?: string
  surface?: string
  truth?: string | null
  visibility?: Visibility
}

export interface CreateRelationshipRequest {
  source_id: number
  target_id: number
  label: string
  description?: string
  visibility?: Visibility
}

export interface UpdateRelationshipRequest {
  label?: string
  description?: string
  visibility?: Visibility
}

export interface CreateSystemRequest {
  name: string
  display_type: SystemDisplayType
  description?: string
  data?: Record<string, unknown>
  constraints?: string[]
}

export interface UpdateSystemRequest {
  name?: string
  display_type?: SystemDisplayType
  description?: string
  data?: Record<string, unknown>
  constraints?: string[]
  visibility?: Visibility
}

export interface BatchConfirmResponse {
  confirmed: number
}

export type BootstrapStatus = 'pending' | 'tokenizing' | 'extracting' | 'windowing' | 'refining' | 'completed' | 'failed'
export type BootstrapMode = 'initial' | 'index_refresh' | 'reextract'
export type BootstrapDraftPolicy = 'replace_bootstrap_drafts' | 'merge'

export interface BootstrapTriggerRequest {
  mode: BootstrapMode
  draft_policy?: BootstrapDraftPolicy
  force?: boolean
}

export interface BootstrapProgress {
  step: number
  detail: string
}

export interface BootstrapResult {
  entities_found: number
  relationships_found: number
  index_refresh_only: boolean
}

export interface BootstrapJobResponse {
  job_id: number
  novel_id: number
  mode: BootstrapMode
  initialized: boolean
  status: BootstrapStatus
  progress: BootstrapProgress
  result: BootstrapResult
  error: string | null
  created_at: string
  updated_at: string
}

export interface WorldpackV1 {
  schema_version: 'worldpack.v1'
  pack_id?: string
  pack_name?: string
  language?: string
  generated_at?: string
  entities?: unknown[]
  relationships?: unknown[]
  systems?: unknown[]
  [key: string]: unknown
}

export interface WorldpackImportCounts {
  entities_created: number
  entities_updated: number
  entities_deleted: number
  attributes_created: number
  attributes_updated: number
  attributes_deleted: number
  relationships_created: number
  relationships_updated: number
  relationships_deleted: number
  systems_created: number
  systems_updated: number
  systems_deleted: number
}

export interface WorldpackImportWarning {
  code: string
  message: string
  message_key: string
  message_params: Record<string, string | number | boolean | null>
  path?: string | null
}

export interface WorldpackImportResponse {
  pack_id: string
  counts: WorldpackImportCounts
  warnings: WorldpackImportWarning[]
}

export type OutlineDraftStatus = 'draft' | 'approved'
export type OutlineGenerateStep = 'volume' | 'chapter'

export interface OutlineChapter {
  chapter_number: number
  chapter_title: string
  brief_text: string
  suspense_density: string | null
  cognitive_twist: number | null
  status: OutlineDraftStatus
}

export interface OutlineVolume {
  volume_number: number
  volume_title: string
  chapter_start: number
  chapter_end: number
  outline_text: string
  status: OutlineDraftStatus
  chapters: OutlineChapter[]
}

export interface OutlineSystemData {
  total_volumes: number | null
  volumes: OutlineVolume[]
}

export interface OutlineSystem extends Omit<WorldSystem, 'display_type' | 'data'> {
  display_type: 'outline'
  data: OutlineSystemData
}

export interface OutlineSystemStateResponse {
  exists: boolean
  system: OutlineSystem | null
}

export interface OutlineGenerateRequest {
  step: OutlineGenerateStep
  volume_number?: number
  total_volumes_hint?: number
  user_guidance?: string
  batch_size?: number
}

export interface OutlineApproveRequest {
  volume_number?: number
}

export type OutlineStreamEvent =
  | { type: 'start'; phase: 'volume_outline'; total_chapters: number; request_id?: string }
  | { type: 'start'; phase: 'chapter_brief'; volumes_to_generate: number; request_id?: string }
  | { type: 'volume_outline'; total_volumes: number | null; volume_number: number; volume_title: string; chapter_start: number; chapter_end: number; outline_text: string; request_id?: string }
  | { type: 'volume_start'; volume_number: number; volume_title: string; chapter_start: number; chapter_end: number; outline_text: string; request_id?: string }
  | { type: 'chapter_brief'; volume_number: number; chapter_number: number; chapter_title: string; brief_text: string; suspense_density: string | null; cognitive_twist: number | null; request_id?: string }
  | { type: 'batch_done'; volume_number: number; batch: number; total_batches: number; request_id?: string }
  | { type: 'volume_done'; volume_number: number; chapter_count: number; request_id?: string }
  | { type: 'done'; phase: 'volume_outline'; system_id: number; volumes_generated: number; request_id?: string }
  | { type: 'done'; phase: 'chapter_brief'; volumes_processed: number; chapters_generated: number; request_id?: string }
  | { type: 'error'; message: string; code?: string; request_id?: string }

// Auth types
export interface QuotaResponse {
  generation_quota: number
  feedback_submitted: boolean
}

export interface UserPreferences {
  num_versions?: number
  temperature?: number
  context_chapters?: number
  target_chars?: number
}

export type StreamEvent =
  | { type: 'start'; variant: number; total_variants: number; debug?: ContinueDebugSummary | null }
  | { type: 'token'; variant: number; content: string }
  | { type: 'variant_done'; variant: number; continuation_id: number; content: string }
  | { type: 'done'; continuation_ids: number[]; debug?: ContinueDebugSummary }
  | { type: 'error'; message: string; code?: string; request_id?: string; variant?: number }
