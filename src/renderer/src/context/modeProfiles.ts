import type { StudyMode } from '../types/context'

const MODE_LABELS: Record<StudyMode, string> = {
  strict: 'Strict',
  study: 'Study',
  relax: 'Relax'
}

export interface ModeProfile {
  mode: StudyMode
  label: string
  thresholdOverrides: Record<string, never>
}

/** Placeholder for future per-mode detection tuning. */
export function getModeProfile(mode: StudyMode): ModeProfile {
  return {
    mode,
    label: MODE_LABELS[mode],
    thresholdOverrides: {}
  }
}

export function getModeLabel(mode: StudyMode): string {
  return MODE_LABELS[mode]
}

export const STUDY_MODES: StudyMode[] = ['strict', 'study', 'relax']

/** Strictest-first order for resolving conflicts among matched rules. */
export const MODE_PRIORITY: StudyMode[] = ['strict', 'study', 'relax']

export function pickStrictestMode(modes: StudyMode[]): StudyMode {
  for (const mode of MODE_PRIORITY) {
    if (modes.includes(mode)) return mode
  }
  return 'relax'
}
