import { resolveCurrentUiLocale } from '@/lib/uiLocale'
import { translateUiMessage, type UiLocale } from '@/lib/uiMessages'
import type { CopilotPrefill } from '@/types/copilot'

export type CopilotScenario = 'whole_book' | 'current_entity' | 'relationships' | 'draft_cleanup' | 'outline'

function readLocale(locale?: UiLocale): UiLocale {
  return locale ?? resolveCurrentUiLocale()
}

export function getCopilotScenario(prefill: CopilotPrefill): CopilotScenario {
  if (prefill.mode === 'outline') return 'outline'
  if (prefill.mode === 'draft_cleanup') return 'draft_cleanup'
  if (prefill.scope === 'whole_book') return 'whole_book'
  if (prefill.context?.tab === 'relationships') return 'relationships'
  return 'current_entity'
}

export function getCopilotScopeLabel(prefill: CopilotPrefill, locale?: UiLocale) {
  const effectiveLocale = readLocale(locale)
  const scenario = getCopilotScenario(prefill)
  if (scenario === 'outline') return translateUiMessage(effectiveLocale, 'copilot.scope.outline')
  if (scenario === 'whole_book') return translateUiMessage(effectiveLocale, 'copilot.scope.wholeBook')
  if (scenario === 'draft_cleanup') return translateUiMessage(effectiveLocale, 'copilot.scope.draftContext')
  if (scenario === 'relationships') return translateUiMessage(effectiveLocale, 'copilot.scope.relationshipContext')
  return translateUiMessage(effectiveLocale, 'copilot.scope.entityContext')
}

export function getDefaultCopilotSessionTitle(prefill: CopilotPrefill, locale?: UiLocale) {
  const effectiveLocale = readLocale(locale)
  if (prefill.mode === 'outline') return translateUiMessage(effectiveLocale, 'copilot.session.title.outline')
  if (prefill.scope === 'whole_book') return translateUiMessage(effectiveLocale, 'copilot.session.title.wholeBook')
  if (prefill.mode === 'draft_cleanup') return translateUiMessage(effectiveLocale, 'copilot.session.title.draftCleanup')
  if (prefill.context?.tab === 'relationships') {
    if (prefill.context?.entity_id) {
      return translateUiMessage(effectiveLocale, 'copilot.session.title.relationshipWithEntityId', { id: prefill.context.entity_id })
    }
    return translateUiMessage(effectiveLocale, 'copilot.session.title.relationshipContext')
  }
  if (prefill.scope === 'current_entity') {
    if (prefill.context?.entity_id) {
      return translateUiMessage(effectiveLocale, 'copilot.session.title.entityWithId', { id: prefill.context.entity_id })
    }
    return translateUiMessage(effectiveLocale, 'copilot.session.title.entityContext')
  }
  return translateUiMessage(effectiveLocale, 'copilot.session.title.currentContext')
}
