import {
  FileSearch,
  FileText,
  Link2,
  type LucideIcon,
  Search,
  Sparkles,
} from 'lucide-react'
import { resolveCurrentUiLocale } from '@/lib/uiLocale'
import { translateUiMessage, type UiLocale } from '@/lib/uiMessages'
import type { CopilotPrefill } from '@/types/copilot'
import { getCopilotScenario } from './novelCopilotHelpers'

export interface CopilotQuickActionSpec {
  id: string
  label: string
  description: string
  prompt: string
  icon: LucideIcon
  iconClassName: string
  glowClassName: string
  layoutClassName?: string
}

export interface CopilotWorkbenchMeta {
  introEyebrow: string
  introTitle: string
  composerLabel: string
  composerPlaceholder: string
  quickActions: CopilotQuickActionSpec[]
}

function t(locale: UiLocale, key: Parameters<typeof translateUiMessage>[1], params?: Parameters<typeof translateUiMessage>[2]) {
  return translateUiMessage(locale, key, params)
}

function wholeBookActions(locale: UiLocale): CopilotQuickActionSpec[] {
  return [
    {
      id: 'scan_world_gaps',
      label: t(locale, 'copilot.workbench.wholeBook.scanGaps.label'),
      description: t(locale, 'copilot.workbench.wholeBook.scanGaps.description'),
      prompt: t(locale, 'copilot.workbench.wholeBook.scanGaps.prompt'),
      icon: Search,
      iconClassName: 'bg-[hsl(var(--accent)/0.12)] text-accent-foreground ring-1 ring-[hsl(var(--accent)/0.20)]',
      glowClassName: 'bg-[radial-gradient(circle_at_top_left,var(--nw-copilot-glow-1),transparent_62%)] [mix-blend-mode:var(--nw-copilot-glow-blend)]',
      layoutClassName: 'sm:col-span-2',
    },
    {
      id: 'trace_recurring_signals',
      label: t(locale, 'copilot.workbench.wholeBook.traceSignals.label'),
      description: t(locale, 'copilot.workbench.wholeBook.traceSignals.description'),
      prompt: t(locale, 'copilot.workbench.wholeBook.traceSignals.prompt'),
      icon: Sparkles,
      iconClassName: 'bg-[hsl(270_80%_65%/0.10)] text-[hsl(270_80%_65%)] ring-1 ring-[hsl(270_80%_65%/0.20)]',
      glowClassName: 'bg-[radial-gradient(circle_at_top_left,var(--nw-copilot-glow-2),transparent_62%)] [mix-blend-mode:var(--nw-copilot-glow-blend)]',
    },
    {
      id: 'find_world_conflicts',
      label: t(locale, 'copilot.workbench.wholeBook.findConflicts.label'),
      description: t(locale, 'copilot.workbench.wholeBook.findConflicts.description'),
      prompt: t(locale, 'copilot.workbench.wholeBook.findConflicts.prompt'),
      icon: FileSearch,
      iconClassName: 'bg-[hsl(220_90%_65%/0.10)] text-[hsl(220_90%_65%)] ring-1 ring-[hsl(220_90%_65%/0.20)]',
      glowClassName: 'bg-[radial-gradient(circle_at_top_left,var(--nw-copilot-glow-3),transparent_62%)] [mix-blend-mode:var(--nw-copilot-glow-blend)]',
    },
  ]
}

function currentEntityActions(locale: UiLocale, subject: string): CopilotQuickActionSpec[] {
  return [
    {
      id: 'complete_entity',
      label: t(locale, 'copilot.workbench.entity.complete.label'),
      description: t(locale, 'copilot.workbench.entity.complete.description'),
      prompt: t(locale, 'copilot.workbench.entity.complete.prompt', { subject }),
      icon: Sparkles,
      iconClassName: 'bg-[hsl(var(--accent)/0.12)] text-accent-foreground ring-1 ring-[hsl(var(--accent)/0.20)]',
      glowClassName: 'bg-[radial-gradient(circle_at_top_left,var(--nw-copilot-glow-1),transparent_62%)] [mix-blend-mode:var(--nw-copilot-glow-blend)]',
      layoutClassName: 'sm:col-span-2',
    },
    {
      id: 'find_relations',
      label: t(locale, 'copilot.workbench.entity.findRelations.label'),
      description: t(locale, 'copilot.workbench.entity.findRelations.description'),
      prompt: t(locale, 'copilot.workbench.entity.findRelations.prompt', { subject }),
      icon: Link2,
      iconClassName: 'bg-[hsl(270_80%_65%/0.10)] text-[hsl(270_80%_65%)] ring-1 ring-[hsl(270_80%_65%/0.20)]',
      glowClassName: 'bg-[radial-gradient(circle_at_top_left,var(--nw-copilot-glow-2),transparent_62%)] [mix-blend-mode:var(--nw-copilot-glow-blend)]',
    },
    {
      id: 'collect_entity_evidence',
      label: t(locale, 'copilot.workbench.entity.collectEvidence.label'),
      description: t(locale, 'copilot.workbench.entity.collectEvidence.description'),
      prompt: t(locale, 'copilot.workbench.entity.collectEvidence.prompt', { subject }),
      icon: FileSearch,
      iconClassName: 'bg-[hsl(220_90%_65%/0.10)] text-[hsl(220_90%_65%)] ring-1 ring-[hsl(220_90%_65%/0.20)]',
      glowClassName: 'bg-[radial-gradient(circle_at_top_left,var(--nw-copilot-glow-3),transparent_62%)] [mix-blend-mode:var(--nw-copilot-glow-blend)]',
    },
  ]
}

function relationshipActions(locale: UiLocale, subject: string): CopilotQuickActionSpec[] {
  return [
    {
      id: 'find_relations',
      label: t(locale, 'copilot.workbench.relationships.find.label'),
      description: t(locale, 'copilot.workbench.relationships.find.description'),
      prompt: t(locale, 'copilot.workbench.relationships.find.prompt', { subject }),
      icon: Link2,
      iconClassName: 'bg-[hsl(var(--accent)/0.12)] text-accent-foreground ring-1 ring-[hsl(var(--accent)/0.20)]',
      glowClassName: 'bg-[radial-gradient(circle_at_top_left,var(--nw-copilot-glow-1),transparent_62%)] [mix-blend-mode:var(--nw-copilot-glow-blend)]',
      layoutClassName: 'sm:col-span-2',
    },
    {
      id: 'label_relationships',
      label: t(locale, 'copilot.workbench.relationships.labeling.label'),
      description: t(locale, 'copilot.workbench.relationships.labeling.description'),
      prompt: t(locale, 'copilot.workbench.relationships.labeling.prompt', { subject }),
      icon: Sparkles,
      iconClassName: 'bg-[hsl(270_80%_65%/0.10)] text-[hsl(270_80%_65%)] ring-1 ring-[hsl(270_80%_65%/0.20)]',
      glowClassName: 'bg-[radial-gradient(circle_at_top_left,var(--nw-copilot-glow-2),transparent_62%)] [mix-blend-mode:var(--nw-copilot-glow-blend)]',
    },
    {
      id: 'collect_interactions',
      label: t(locale, 'copilot.workbench.relationships.collect.label'),
      description: t(locale, 'copilot.workbench.relationships.collect.description'),
      prompt: t(locale, 'copilot.workbench.relationships.collect.prompt', { subject }),
      icon: FileSearch,
      iconClassName: 'bg-[hsl(220_90%_65%/0.10)] text-[hsl(220_90%_65%)] ring-1 ring-[hsl(220_90%_65%/0.20)]',
      glowClassName: 'bg-[radial-gradient(circle_at_top_left,var(--nw-copilot-glow-3),transparent_62%)] [mix-blend-mode:var(--nw-copilot-glow-blend)]',
    },
  ]
}

function draftCleanupActions(locale: UiLocale): CopilotQuickActionSpec[] {
  return [
    {
      id: 'review_drafts',
      label: t(locale, 'copilot.workbench.draft.review.label'),
      description: t(locale, 'copilot.workbench.draft.review.description'),
      prompt: t(locale, 'copilot.workbench.draft.review.prompt'),
      icon: FileText,
      iconClassName: 'bg-[hsl(var(--accent)/0.12)] text-accent-foreground ring-1 ring-[hsl(var(--accent)/0.20)]',
      glowClassName: 'bg-[radial-gradient(circle_at_top_left,var(--nw-copilot-glow-1),transparent_62%)] [mix-blend-mode:var(--nw-copilot-glow-blend)]',
      layoutClassName: 'sm:col-span-2',
    },
    {
      id: 'normalize_terms',
      label: t(locale, 'copilot.workbench.draft.normalize.label'),
      description: t(locale, 'copilot.workbench.draft.normalize.description'),
      prompt: t(locale, 'copilot.workbench.draft.normalize.prompt'),
      icon: Sparkles,
      iconClassName: 'bg-[hsl(270_80%_65%/0.10)] text-[hsl(270_80%_65%)] ring-1 ring-[hsl(270_80%_65%/0.20)]',
      glowClassName: 'bg-[radial-gradient(circle_at_top_left,var(--nw-copilot-glow-2),transparent_62%)] [mix-blend-mode:var(--nw-copilot-glow-blend)]',
    },
    {
      id: 'fill_missing_fields',
      label: t(locale, 'copilot.workbench.draft.fill.label'),
      description: t(locale, 'copilot.workbench.draft.fill.description'),
      prompt: t(locale, 'copilot.workbench.draft.fill.prompt'),
      icon: FileSearch,
      iconClassName: 'bg-[hsl(220_90%_65%/0.10)] text-[hsl(220_90%_65%)] ring-1 ring-[hsl(220_90%_65%/0.20)]',
      glowClassName: 'bg-[radial-gradient(circle_at_top_left,var(--nw-copilot-glow-3),transparent_62%)] [mix-blend-mode:var(--nw-copilot-glow-blend)]',
    },
  ]
}

function outlineActions(locale: UiLocale): CopilotQuickActionSpec[] {
  return [
    {
      id: 'generate_volume_outlines',
      label: t(locale, 'copilot.workbench.outline.generateVolumes.label'),
      description: t(locale, 'copilot.workbench.outline.generateVolumes.description'),
      prompt: t(locale, 'copilot.workbench.outline.generateVolumes.prompt'),
      icon: FileText,
      iconClassName: 'bg-[hsl(var(--accent)/0.12)] text-accent-foreground ring-1 ring-[hsl(var(--accent)/0.20)]',
      glowClassName: 'bg-[radial-gradient(circle_at_top_left,var(--nw-copilot-glow-1),transparent_62%)] [mix-blend-mode:var(--nw-copilot-glow-blend)]',
      layoutClassName: 'sm:col-span-2',
    },
    {
      id: 'generate_chapter_outlines',
      label: t(locale, 'copilot.workbench.outline.generateChapters.label'),
      description: t(locale, 'copilot.workbench.outline.generateChapters.description'),
      prompt: t(locale, 'copilot.workbench.outline.generateChapters.prompt'),
      icon: Sparkles,
      iconClassName: 'bg-[hsl(270_80%_65%/0.10)] text-[hsl(270_80%_65%)] ring-1 ring-[hsl(270_80%_65%/0.20)]',
      glowClassName: 'bg-[radial-gradient(circle_at_top_left,var(--nw-copilot-glow-2),transparent_62%)] [mix-blend-mode:var(--nw-copilot-glow-blend)]',
    },
    {
      id: 'review_outline',
      label: t(locale, 'copilot.workbench.outline.review.label'),
      description: t(locale, 'copilot.workbench.outline.review.description'),
      prompt: t(locale, 'copilot.workbench.outline.review.prompt'),
      icon: FileSearch,
      iconClassName: 'bg-[hsl(220_90%_65%/0.10)] text-[hsl(220_90%_65%)] ring-1 ring-[hsl(220_90%_65%/0.20)]',
      glowClassName: 'bg-[radial-gradient(circle_at_top_left,var(--nw-copilot-glow-3),transparent_62%)] [mix-blend-mode:var(--nw-copilot-glow-blend)]',
    },
  ]
}

export function getCopilotWorkbenchMeta(prefill: CopilotPrefill, displayTitle: string, locale: UiLocale = resolveCurrentUiLocale()): CopilotWorkbenchMeta {
  const scenario = getCopilotScenario(prefill)
  const subject = displayTitle || translateUiMessage(locale, 'copilot.session.title.currentContext')

  switch (scenario) {
    case 'whole_book':
      return {
        introEyebrow: t(locale, 'copilot.workbench.wholeBook.eyebrow'),
        introTitle: t(locale, 'copilot.workbench.wholeBook.title'),
        composerLabel: t(locale, 'copilot.workbench.wholeBook.composerLabel'),
        composerPlaceholder: t(locale, 'copilot.workbench.wholeBook.composerPlaceholder'),
        quickActions: wholeBookActions(locale),
      }
    case 'relationships':
      return {
        introEyebrow: t(locale, 'copilot.workbench.relationships.eyebrow'),
        introTitle: t(locale, 'copilot.workbench.relationships.title', { subject }),
        composerLabel: t(locale, 'copilot.workbench.relationships.composerLabel'),
        composerPlaceholder: t(locale, 'copilot.workbench.relationships.composerPlaceholder', { subject }),
        quickActions: relationshipActions(locale, subject),
      }
    case 'draft_cleanup':
      return {
        introEyebrow: t(locale, 'copilot.workbench.draft.eyebrow'),
        introTitle: t(locale, 'copilot.workbench.draft.title'),
        composerLabel: t(locale, 'copilot.workbench.draft.composerLabel'),
        composerPlaceholder: t(locale, 'copilot.workbench.draft.composerPlaceholder'),
        quickActions: draftCleanupActions(locale),
      }
    case 'outline':
      return {
        introEyebrow: t(locale, 'copilot.workbench.outline.eyebrow'),
        introTitle: t(locale, 'copilot.workbench.outline.title'),
        composerLabel: t(locale, 'copilot.workbench.outline.composerLabel'),
        composerPlaceholder: t(locale, 'copilot.workbench.outline.composerPlaceholder'),
        quickActions: outlineActions(locale),
      }
    default:
      return {
        introEyebrow: t(locale, 'copilot.workbench.entity.eyebrow'),
        introTitle: t(locale, 'copilot.workbench.entity.title', { subject }),
        composerLabel: t(locale, 'copilot.workbench.entity.composerLabel'),
        composerPlaceholder: t(locale, 'copilot.workbench.entity.composerPlaceholder', { subject }),
        quickActions: currentEntityActions(locale, subject),
      }
  }
}
