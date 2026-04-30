import type { useUiLocale } from '@/contexts/UiLocaleContext'
import type { OutlineGenerateRequest } from '@/types/api'

export type ScopeTab = 'volumes' | 'chapters'
export type StreamPhase = OutlineGenerateRequest['step'] | null
export type Translate = ReturnType<typeof useUiLocale>['t']
export type UiLocale = ReturnType<typeof useUiLocale>['locale']

export type ActivityItem = {
  id: string
  tone: 'info' | 'success' | 'warning' | 'error'
  text: string
}
