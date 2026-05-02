import { useEffect, useState, useCallback } from 'react'
import {
  llmProviderApi,
  LlmProviderResponse,
  LlmProviderCreate,
  LlmProviderUpdate,
  LlmProviderTestResult,
} from '@/services/llmProviderApi'
import { ApiError } from '@/services/apiClient'

const MASK_TOKEN = '****'

const PRESETS = [
  { slug: 'openai', name: 'OpenAI', base_url: 'https://api.openai.com/v1', url_hint: 'https://api.openai.com/v1', models: ['gpt-4o-mini'] },
  { slug: 'deepseek', name: 'DeepSeek', base_url: 'https://api.deepseek.com', url_hint: 'https://api.deepseek.com', models: ['deepseek-chat'] },
  { slug: 'custom', name: '自定义', base_url: '', url_hint: '', models: [] },
] as const

interface EditingProvider {
  name: string
  preset_slug: string | null
  base_url: string
  api_key: string
  models: { model_name: string; display_name: string; is_default: boolean }[]
  is_default: boolean
}

export function LlmProviderManager() {
  const [providers, setProviders] = useState<LlmProviderResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [editing, setEditing] = useState<EditingProvider | null>(null)
  const [editingId, setEditingId] = useState<number | null>(null) // null = creating
  const [showPresets, setShowPresets] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<LlmProviderTestResult | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try { setProviders(await llmProviderApi.list()) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const startCreate = (preset?: typeof PRESETS[number]) => {
    setEditingId(null)
    setEditing({
      name: preset?.name ?? '',
      preset_slug: preset?.slug === 'custom' ? null : (preset?.slug ?? null),
      base_url: preset?.base_url ?? '',
      api_key: '',
      models: preset?.models.map((m, i) => ({ model_name: m, display_name: '', is_default: i === 0 })) ?? [{ model_name: '', display_name: '', is_default: true }],
      is_default: providers.length === 0,
    })
    setShowPresets(false)
    setTestResult(null)
    setError(null)
  }

  const startEdit = (p: LlmProviderResponse) => {
    setEditingId(p.id)
    setEditing({
      name: p.name,
      preset_slug: p.preset_slug,
      base_url: p.base_url,
      api_key: '',
      models: p.models.map(m => ({ model_name: m.model_name, display_name: m.display_name ?? '', is_default: m.is_default })),
      is_default: p.is_default,
    })
    setTestResult(null)
    setError(null)
  }

  const handleTest = async () => {
    if (!editing) return
    setTesting(true)
    setTestResult(null)
    setError(null)
    try {
      // For new providers, create temporarily then test
      let targetId = editingId
      if (!targetId) {
        const created = await llmProviderApi.create(editingToCreate(editing))
        targetId = created.id
        setEditingId(created.id)
        await load()
      }
      const modelName = editing.models.find(m => m.is_default)?.model_name || editing.models[0]?.model_name
      setTestResult(await llmProviderApi.test(targetId, modelName || undefined))
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e))
    } finally { setTesting(false) }
  }

  const handleSave = async () => {
    if (!editing) return
    setSaving(true)
    setError(null)
    try {
      if (editingId) {
        const update: LlmProviderUpdate = { name: editing.name, base_url: editing.base_url, is_default: editing.is_default }
        if (editing.api_key && !editing.api_key.includes(MASK_TOKEN)) update.api_key = editing.api_key
        if (editing.models.length > 0) update.models = editing.models.filter(m => m.model_name.trim())
        await llmProviderApi.update(editingId, update)
      } else {
        await llmProviderApi.create(editingToCreate(editing))
      }
      setEditing(null)
      setEditingId(null)
      await load()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e))
    } finally { setSaving(false) }
  }

  const handleDelete = async (id: number) => {
    try { await llmProviderApi.delete(id); setExpandedId(null); await load() }
    catch (e) { setError(e instanceof ApiError ? e.message : String(e)) }
  }

  const handleSetDefault = async (id: number) => {
    try { await llmProviderApi.setDefault(id); await load() }
    catch (e) { setError(e instanceof ApiError ? e.message : String(e)) }
  }

  const updateModel = (idx: number, field: string, value: string | boolean) => {
    if (!editing) return
    const models = editing.models.map((m, i) => i === idx ? { ...m, [field]: value } : m)
    if (field === 'is_default' && value) models.forEach((m, i) => { if (i !== idx) m.is_default = false })
    setEditing({ ...editing, models })
  }

  const addModel = () => {
    if (!editing) return
    setEditing({ ...editing, models: [...editing.models, { model_name: '', display_name: '', is_default: editing.models.length === 0 }] })
  }

  const removeModel = (idx: number) => {
    if (!editing) return
    const models = editing.models.filter((_, i) => i !== idx)
    if (models.length > 0 && !models.some(m => m.is_default)) models[0].is_default = true
    setEditing({ ...editing, models })
  }

  const inputCls = 'h-10 w-full rounded-lg border border-[var(--nw-glass-border)] bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'

  if (loading) return <div className="py-8 text-center text-sm text-muted-foreground">Loading...</div>

  // Editing form
  if (editing) {
    return (
      <div className="flex flex-col gap-4 rounded-2xl border border-[var(--nw-glass-border)] bg-[var(--nw-glass-bg)] p-5">
        <h3 className="text-sm font-semibold">{editingId ? '编辑提供商' : '添加提供商'}</h3>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium">名称</label>
          <input className={inputCls} value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} placeholder="如：我的 DeepSeek" />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium">Base URL {editing.preset_slug && <span className="text-muted-foreground">({editing.preset_slug})</span>}</label>
          <input className={inputCls} value={editing.base_url} onChange={e => setEditing({ ...editing, base_url: e.target.value })} placeholder={PRESETS.find(p => p.slug === editing.preset_slug)?.url_hint || 'https://api.openai.com/v1'} />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium">API Key {editingId && <span className="text-muted-foreground">(留空保持原值)</span>}</label>
          <input className={inputCls} type="password" value={editing.api_key} onChange={e => setEditing({ ...editing, api_key: e.target.value })} placeholder={editingId ? 'sk-**** (留空不改)' : 'sk-...'} />
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium">模型</label>
            <button type="button" onClick={addModel} className="text-xs text-accent hover:underline">+ 添加模型</button>
          </div>
          {editing.models.map((m, i) => (
            <div key={i} className="flex items-center gap-2">
              <input className={`${inputCls} flex-1`} value={m.model_name} onChange={e => updateModel(i, 'model_name', e.target.value)} placeholder="model-name" />
              <input className={`${inputCls} flex-1`} value={m.display_name} onChange={e => updateModel(i, 'display_name', e.target.value)} placeholder="显示名 (可选)" />
              <button type="button" onClick={() => updateModel(i, 'is_default', !m.is_default)} className={`shrink-0 h-8 px-2 rounded text-xs border ${m.is_default ? 'border-accent text-accent' : 'border-[var(--nw-glass-border)] text-muted-foreground'}`}>
                {m.is_default ? '默认' : '设默认'}
              </button>
              {editing.models.length > 1 && (
                <button type="button" onClick={() => removeModel(i)} className="shrink-0 h-8 w-8 rounded border border-[var(--nw-glass-border)] text-muted-foreground hover:text-red-500">×</button>
              )}
            </div>
          ))}
        </div>

        {testResult && (
          <div className={`text-xs rounded-lg p-3 ${testResult.ok ? 'bg-green-500/10 text-green-600' : 'bg-red-500/10 text-red-500'}`}>
            {testResult.ok ? testResult.message : testResult.error}
            {' '}({testResult.latency_ms}ms)
          </div>
        )}
        {error && <div className="text-xs rounded-lg bg-red-500/10 p-3 text-red-500">{error}</div>}

        <div className="flex items-center gap-2 pt-1">
          <button type="button" onClick={handleTest} disabled={testing || !editing.name || !editing.base_url || !editing.api_key} className="h-10 flex-1 rounded-[10px] border border-accent/25 text-accent text-sm font-medium hover:bg-accent/8 disabled:opacity-40 disabled:cursor-not-allowed">
            {testing ? '测试中...' : '测试连接'}
          </button>
          <button type="button" onClick={handleSave} disabled={saving || !editing.name || editing.models.every(m => !m.model_name.trim())} className="h-10 flex-1 rounded-[10px] bg-accent text-accent-foreground text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed">
            {saving ? '保存中...' : '保存'}
          </button>
          <button type="button" onClick={() => { setEditing(null); setEditingId(null); setTestResult(null) }} className="h-10 px-4 rounded-[10px] border border-[var(--nw-glass-border)] text-sm text-muted-foreground hover:bg-white/5">
            取消
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {providers.length === 0 && (
        <div className="rounded-2xl border border-[var(--nw-glass-border)] bg-[var(--nw-glass-bg)] p-5 text-center text-sm text-muted-foreground">
          尚未配置任何模型提供商。未配置时将使用 .env 环境变量。
        </div>
      )}

      {providers.map(p => (
        <div key={p.id} className="rounded-2xl border border-[var(--nw-glass-border)] bg-[var(--nw-glass-bg)] overflow-hidden">
          <div className="flex items-center justify-between gap-3 px-5 py-3 cursor-pointer hover:bg-white/[0.02]" onClick={() => setExpandedId(expandedId === p.id ? null : p.id)}>
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-sm font-medium truncate">{p.name}</span>
              {p.is_default && <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-accent/15 text-accent font-medium">默认</span>}
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {!p.is_default && (
                <button type="button" onClick={e => { e.stopPropagation(); handleSetDefault(p.id) }} className="text-xs text-muted-foreground hover:text-accent">设为默认</button>
              )}
              <button type="button" onClick={e => { e.stopPropagation(); startEdit(p) }} className="text-xs text-muted-foreground hover:text-accent">编辑</button>
              <button type="button" onClick={e => { e.stopPropagation(); handleDelete(p.id) }} className="text-xs text-muted-foreground hover:text-red-500">删除</button>
              <svg className={`w-4 h-4 text-muted-foreground transition-transform ${expandedId === p.id ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </div>
          </div>
          {expandedId === p.id && (
            <div className="px-5 pb-4 flex flex-col gap-2 text-xs text-muted-foreground border-t border-[var(--nw-glass-border)] pt-3">
              <div>Base URL: <span className="text-foreground">{p.base_url}</span></div>
              <div>API Key: <span className="font-mono">{p.api_key}</span></div>
              <div className="flex flex-wrap gap-1.5">
                模型: {p.models.map(m => (
                  <span key={m.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-[var(--nw-glass-border)] text-foreground">
                    {m.model_name}{m.display_name ? ` (${m.display_name})` : ''}{m.is_default ? ' ★' : ''}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      ))}

      {/* Add button */}
      <div className="relative">
        <button type="button" onClick={() => setShowPresets(!showPresets)} className="flex items-center justify-center h-10 w-full rounded-[10px] border border-dashed border-[var(--nw-glass-border)] text-sm text-muted-foreground hover:border-accent hover:text-accent transition-colors">
          + 添加模型提供商
        </button>
        {showPresets && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setShowPresets(false)} />
            <div className="absolute left-0 right-0 top-12 z-20 rounded-xl border border-[var(--nw-glass-border)] bg-[var(--nw-glass-bg)] shadow-lg backdrop-blur-xl py-1">
              {PRESETS.map(p => (
                <button key={p.slug} type="button" onClick={() => startCreate(p)} className="w-full px-4 py-2.5 text-left text-sm hover:bg-white/5 flex items-center justify-between">
                  <span>{p.name}</span>
                  {p.base_url && <span className="text-xs text-muted-foreground">{p.url_hint}</span>}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function editingToCreate(e: EditingProvider): LlmProviderCreate {
  return {
    name: e.name,
    preset_slug: e.preset_slug ?? undefined,
    base_url: e.base_url,
    api_key: e.api_key,
    models: e.models.filter(m => m.model_name.trim()).map(m => ({ model_name: m.model_name, display_name: m.display_name || undefined, is_default: m.is_default })),
    is_default: e.is_default,
  }
}
