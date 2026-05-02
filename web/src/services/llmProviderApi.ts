import { request } from './apiClient'

export interface LlmProviderModelResponse {
  id: number
  model_name: string
  display_name: string | null
  is_default: boolean
}

export interface LlmProviderResponse {
  id: number
  name: string
  preset_slug: string | null
  base_url: string
  api_key: string
  api_key_set: boolean
  is_default: boolean
  models: LlmProviderModelResponse[]
  created_at: string
  updated_at: string
}

export interface LlmProviderModelCreate {
  model_name: string
  display_name?: string
  is_default?: boolean
}

export interface LlmProviderCreate {
  name: string
  preset_slug?: string
  base_url: string
  api_key: string
  models: LlmProviderModelCreate[]
  is_default?: boolean
}

export interface LlmProviderUpdate {
  name?: string
  base_url?: string
  api_key?: string
  is_default?: boolean
  models?: LlmProviderModelCreate[]
}

export interface LlmProviderTestResult {
  ok: boolean
  model: string
  latency_ms: number
  capabilities: { basic: boolean; stream: boolean; json_mode: boolean }
  message?: string
  error?: string
}

export const llmProviderApi = {
  list: () =>
    request<LlmProviderResponse[]>('/api/llm/providers'),

  create: (data: LlmProviderCreate) =>
    request<LlmProviderResponse>('/api/llm/providers', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (id: number, data: LlmProviderUpdate) =>
    request<LlmProviderResponse>(`/api/llm/providers/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  delete: (id: number) =>
    request<void>(`/api/llm/providers/${id}`, { method: 'DELETE' }),

  setDefault: (id: number) =>
    request<LlmProviderResponse>(`/api/llm/providers/${id}/default`, { method: 'PUT' }),

  test: (id: number, modelName?: string) =>
    request<LlmProviderTestResult>(`/api/llm/providers/${id}/test`, {
      method: 'POST',
      body: JSON.stringify(modelName ? { model_name: modelName } : {}),
    }),
}
