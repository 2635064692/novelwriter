import { useEffect, useState, useCallback } from 'react'
import { llmProviderApi, LlmProviderResponse } from '@/services/llmProviderApi'

const LAST_MODEL_KEY = 'lastCopilotModelId'

export function getLastModelId(): number | null {
  const v = localStorage.getItem(LAST_MODEL_KEY)
  return v ? parseInt(v, 10) : null
}

export function setLastModelId(id: number | null) {
  if (id == null) localStorage.removeItem(LAST_MODEL_KEY)
  else localStorage.setItem(LAST_MODEL_KEY, String(id))
}

interface ModelSelectorPillProps {
  selectedModelId: number | null
  onSelect: (modelId: number | null, modelName: string) => void
}

export function ModelSelectorPill({ selectedModelId, onSelect }: ModelSelectorPillProps) {
  const [providers, setProviders] = useState<LlmProviderResponse[]>([])
  const [open, setOpen] = useState(false)

  const load = useCallback(async () => {
    try { setProviders(await llmProviderApi.list()) } catch { /* ignore */ }
  }, [])

  useEffect(() => { load() }, [load])

  // Find current model name
  let currentName = '默认模型'
  for (const p of providers) {
    for (const m of p.models) {
      if (m.id === selectedModelId) {
        currentName = m.display_name || m.model_name
      }
    }
  }

  const allModels = providers.flatMap(p =>
    p.models.map(m => ({ ...m, providerName: p.name, providerId: p.id }))
  )

  if (allModels.length === 0) return null

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium text-muted-foreground/80 hover:text-foreground/80 transition-colors border border-transparent hover:border-[var(--nw-glass-border)]"
      >
        <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
        <span className="truncate max-w-[100px]">{currentName}</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full mt-1 z-20 min-w-[220px] max-h-[300px] overflow-y-auto rounded-xl border border-[var(--nw-glass-border)] bg-[var(--nw-glass-bg)] shadow-lg backdrop-blur-xl py-1">
            {providers.map(p => (
              <div key={p.id}>
                <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">{p.name}</div>
                {p.models.map(m => {
                  const isSelected = m.id === selectedModelId
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => {
                        onSelect(m.id, m.model_name)
                        setLastModelId(m.id)
                        setOpen(false)
                      }}
                      className={`w-full px-3 py-2 text-left text-xs flex items-center justify-between hover:bg-white/5 ${isSelected ? 'text-accent' : 'text-foreground'}`}
                    >
                      <span className="truncate">
                        {m.display_name || m.model_name}
                        {m.display_name && <span className="ml-1 text-muted-foreground">{m.model_name}</span>}
                      </span>
                      {isSelected && (
                        <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                      )}
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
