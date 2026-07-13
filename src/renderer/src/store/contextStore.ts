import { create } from 'zustand'
import { matchAutoContextRule } from '../context/matchRule'
import { SYNC_CONFLICT_NOTICE } from '../context/contextCopy'
import { pickStrictestMode } from '../context/modeProfiles'
import { isStrictRuleDeleteLocked } from '../context/ruleDeleteLock'
import {
  CONTEXT_RULES_STORAGE_KEY,
  MANUAL_MODE_STORAGE_KEY,
  SYNC_PUSH_DEBOUNCE_MS
} from '../constants/thresholds'
import {
  bumpLocalUpdatedAt,
  clearSyncToken,
  createSyncGroup,
  getOrCreateDeviceId,
  getSyncToken,
  isSupabaseConfigured,
  joinSyncGroup,
  pullPeerModes,
  pullRules,
  pushPeerMode,
  pushRules,
  syncRules,
  type SyncApplyResult
} from '../services/contextSync'
import type {
  ContextRule,
  ContextSource,
  GeoPoint,
  PeerModeEntry,
  StudyMode
} from '../types/context'

export type SyncStatus = 'idle' | 'syncing' | 'error' | 'conflict' | 'unconfigured'

interface ContextState {
  activeMode: StudyMode
  contextSource: ContextSource
  matchedRuleId: string | null
  currentWifi: string | null
  currentLocation: GeoPoint | null
  locationError: string | null
  manualMode: StudyMode | null
  rules: ContextRule[]
  deviceId: string
  peerModes: Record<string, PeerModeEntry>
  syncToken: string | null
  syncStatus: SyncStatus
  syncError: string | null
  lastSyncedAt: number | null
  addWifiRule: (ssid: string, mode: StudyMode, label?: string) => void
  addLocationRule: (
    lat: number,
    lng: number,
    radiusM: number,
    mode: StudyMode,
    label?: string
  ) => void
  removeRule: (id: string) => void
  setManualMode: (mode: StudyMode | null) => void
  setCurrentWifi: (ssid: string | null) => void
  setCurrentLocation: (location: GeoPoint | null, error?: string | null) => void
  applyContextMatch: () => void
  loadPersisted: () => void
  initSync: () => Promise<void>
  createSync: () => Promise<string | null>
  joinSync: (token: string) => Promise<boolean>
  disconnectSync: () => void
  syncNow: () => Promise<void>
}

let pushDebounceTimer: number | null = null
let peerModePushTimer: number | null = null

function normalizeStudyMode(value: string): StudyMode {
  if (value === 'strict' || value === 'study' || value === 'relax') return value
  if (value === 'focus') return 'study'
  if (value === 'library') return 'strict'
  if (value === 'home' || value === 'cafe') return 'relax'
  return 'relax'
}

function normalizeRules(rules: ContextRule[]): ContextRule[] {
  return rules.map((rule) => ({ ...rule, mode: normalizeStudyMode(rule.mode) }))
}

function loadRules(): ContextRule[] {
  try {
    const raw = localStorage.getItem(CONTEXT_RULES_STORAGE_KEY)
    if (!raw) return []
    return normalizeRules(JSON.parse(raw) as ContextRule[])
  } catch {
    return []
  }
}

function saveRules(rules: ContextRule[]): void {
  localStorage.setItem(CONTEXT_RULES_STORAGE_KEY, JSON.stringify(rules))
}

function loadManualMode(): StudyMode | null {
  const raw = localStorage.getItem(MANUAL_MODE_STORAGE_KEY)
  if (!raw || raw === 'null') return null
  return normalizeStudyMode(raw)
}

function saveManualMode(mode: StudyMode | null): void {
  if (mode) {
    localStorage.setItem(MANUAL_MODE_STORAGE_KEY, mode)
  } else {
    localStorage.removeItem(MANUAL_MODE_STORAGE_KEY)
  }
}

function recomputeMatch(state: {
  rules: ContextRule[]
  manualMode: StudyMode | null
  currentWifi: string | null
  currentLocation: GeoPoint | null
  syncToken: string | null
  deviceId: string
  peerModes: Record<string, PeerModeEntry>
}): Pick<ContextState, 'activeMode' | 'contextSource' | 'matchedRuleId'> {
  if (state.manualMode) {
    return {
      activeMode: state.manualMode,
      contextSource: 'manual',
      matchedRuleId: null
    }
  }

  const auto = matchAutoContextRule({
    rules: state.rules,
    currentWifi: state.currentWifi,
    currentLocation: state.currentLocation
  })

  if (!state.syncToken) {
    return auto
  }

  const remoteModes = Object.entries(state.peerModes)
    .filter(([id]) => id !== state.deviceId)
    .map(([, entry]) => entry.mode)

  if (remoteModes.length === 0) {
    return auto
  }

  const merged = pickStrictestMode([auto.activeMode, ...remoteModes])
  if (merged !== auto.activeMode) {
    return {
      activeMode: merged,
      contextSource: 'sync',
      matchedRuleId: auto.matchedRuleId
    }
  }

  return auto
}

async function pushLocalAutoPeerMode(
  get: () => ContextState,
  set: (
    partial:
      | Partial<ContextState>
      | ((state: ContextState) => Partial<ContextState>)
  ) => void
): Promise<void> {
  const state = get()
  if (!state.syncToken || !isSupabaseConfigured()) return
  const auto = matchAutoContextRule({
    rules: state.rules,
    currentWifi: state.currentWifi,
    currentLocation: state.currentLocation
  })
  const result = await pushPeerMode(state.deviceId, auto.activeMode, state.peerModes)
  if ('error' in result) return
  set({ peerModes: result.peerModes })
}

function schedulePeerModePush(
  get: () => ContextState,
  set: (
    partial:
      | Partial<ContextState>
      | ((state: ContextState) => Partial<ContextState>)
  ) => void
): void {
  if (!get().syncToken || !isSupabaseConfigured()) return
  if (peerModePushTimer) window.clearTimeout(peerModePushTimer)
  peerModePushTimer = window.setTimeout(() => {
    void pushLocalAutoPeerMode(get, set)
  }, SYNC_PUSH_DEBOUNCE_MS)
}

async function pullAndApplyPeerModes(
  get: () => ContextState,
  set: (
    partial:
      | Partial<ContextState>
      | ((state: ContextState) => Partial<ContextState>)
  ) => void
): Promise<void> {
  const result = await pullPeerModes()
  if ('error' in result) return
  set((state) => {
    const next = { ...state, peerModes: result.peerModes }
    return { ...next, ...recomputeMatch(next) }
  })
  schedulePeerModePush(get, set)
}

function applyPulledRules(
  set: (
    partial:
      | Partial<ContextState>
      | ((state: ContextState) => Partial<ContextState>)
  ) => void,
  rules: ContextRule[],
  syncStatus: SyncStatus,
  syncError: string | null
): void {
  saveRules(rules)
  set((state) => {
    const next = { ...state, rules, syncStatus, syncError, lastSyncedAt: Date.now() }
    return { ...next, ...recomputeMatch(next) }
  })
}

function applySyncResult(
  set: (
    partial:
      | Partial<ContextState>
      | ((state: ContextState) => Partial<ContextState>)
  ) => void,
  result: SyncApplyResult
): void {
  if (result.action === 'pulled') {
    applyPulledRules(set, result.rules, 'idle', null)
    return
  }
  if (result.action === 'pushed') {
    set({ syncStatus: 'idle', syncError: null, lastSyncedAt: Date.now() })
    return
  }
  if (result.action === 'conflict') {
    void pullRules().then((pullResult) => {
      if (pullResult.action === 'pulled') {
        applyPulledRules(set, pullResult.rules, 'conflict', SYNC_CONFLICT_NOTICE)
      } else {
        set({ syncStatus: 'conflict', syncError: SYNC_CONFLICT_NOTICE })
      }
    })
    return
  }
  if (result.action === 'error') {
    set({ syncStatus: 'error', syncError: result.message })
    return
  }
  set({ syncStatus: 'idle', syncError: null })
}

function scheduleCloudPush(
  get: () => ContextState,
  set: (
    partial:
      | Partial<ContextState>
      | ((state: ContextState) => Partial<ContextState>)
  ) => void
): void {
  if (!get().syncToken || !isSupabaseConfigured()) return
  if (pushDebounceTimer) window.clearTimeout(pushDebounceTimer)
  pushDebounceTimer = window.setTimeout(() => {
    void (async () => {
      set({ syncStatus: 'syncing', syncError: null })
      const result = await pushRules(get().rules)
      applySyncResult(set, result)
    })()
  }, SYNC_PUSH_DEBOUNCE_MS)
}

function applyMatchPatch(
  state: ContextState,
  get: () => ContextState,
  set: (
    partial:
      | Partial<ContextState>
      | ((state: ContextState) => Partial<ContextState>)
  ) => void,
  patch: Partial<ContextState>
): Partial<ContextState> {
  const next = { ...state, ...patch }
  const match = recomputeMatch(next)
  schedulePeerModePush(get, set)
  return { ...next, ...match }
}

function afterLocalRulesChange(
  state: ContextState,
  set: (
    partial:
      | Partial<ContextState>
      | ((state: ContextState) => Partial<ContextState>)
  ) => void,
  get: () => ContextState,
  rules: ContextRule[]
): Partial<ContextState> {
  saveRules(rules)
  bumpLocalUpdatedAt()
  scheduleCloudPush(get, set)
  return applyMatchPatch(state, get, set, { rules })
}

export const useContextStore = create<ContextState>((set, get) => ({
  activeMode: 'relax',
  contextSource: 'default',
  matchedRuleId: null,
  currentWifi: null,
  currentLocation: null,
  locationError: null,
  manualMode: null,
  rules: [],
  deviceId: getOrCreateDeviceId(),
  peerModes: {},
  syncToken: null,
  syncStatus: (isSupabaseConfigured() ? 'idle' : 'unconfigured') as SyncStatus,
  syncError: null,
  lastSyncedAt: null,

  loadPersisted: () => {
    const rules = loadRules()
    const manualMode = loadManualMode()
    const syncToken = getSyncToken()
    set((state) => {
      const next = {
        ...state,
        rules,
        manualMode,
        syncToken,
        syncStatus: (isSupabaseConfigured() ? 'idle' : 'unconfigured') as SyncStatus
      }
      return { ...next, ...recomputeMatch(next) }
    })
    void get().initSync()
  },

  initSync: async () => {
    if (!isSupabaseConfigured()) {
      set({ syncStatus: 'unconfigured', syncToken: getSyncToken() })
      return
    }
    const syncToken = getSyncToken()
    if (!syncToken) {
      set({ syncToken: null, syncStatus: 'idle' })
      return
    }
    set({ syncToken, syncStatus: 'syncing', syncError: null })
    await pullAndApplyPeerModes(get, set)
    const result = await syncRules(get().rules)
    applySyncResult(set, result)
    await pushLocalAutoPeerMode(get, set)
  },

  createSync: async () => {
    if (!isSupabaseConfigured()) return null
    set({ syncStatus: 'syncing', syncError: null })
    const result = await createSyncGroup(get().rules)
    if ('error' in result) {
      set({ syncStatus: 'error', syncError: result.error })
      return null
    }
    set({ syncToken: result.token, syncStatus: 'idle', lastSyncedAt: Date.now(), syncError: null })
    await pushLocalAutoPeerMode(get, set)
    return result.token
  },

  joinSync: async (token) => {
    if (!isSupabaseConfigured()) return false
    set({ syncStatus: 'syncing', syncError: null })
    const joined = await joinSyncGroup(token)
    if ('error' in joined) {
      set({ syncStatus: 'error', syncError: joined.error })
      return false
    }
    set({ syncToken: token.trim() })
    await get().syncNow()
    return true
  },

  disconnectSync: () => {
    clearSyncToken()
    set((state) => {
      const next = {
        ...state,
        syncToken: null,
        peerModes: {},
        syncStatus: (isSupabaseConfigured() ? 'idle' : 'unconfigured') as SyncStatus,
        syncError: null
      }
      return { ...next, ...recomputeMatch(next) }
    })
  },

  syncNow: async () => {
    if (!isSupabaseConfigured() || !get().syncToken) return
    set({ syncStatus: 'syncing', syncError: null })
    await pullAndApplyPeerModes(get, set)
    const result = await syncRules(get().rules)
    applySyncResult(set, result)
    await pushLocalAutoPeerMode(get, set)
  },

  addWifiRule: (ssid, mode, label) => {
    const trimmed = ssid.trim()
    if (!trimmed) return
    const rule: ContextRule = {
      id: crypto.randomUUID(),
      kind: 'wifi',
      ssid: trimmed,
      mode,
      label,
      createdAt: Date.now()
    }
    set((state) => {
      const rules = [...state.rules, rule]
      return afterLocalRulesChange(state, set, get, rules)
    })
  },

  addLocationRule: (lat, lng, radiusM, mode, label) => {
    const rule: ContextRule = {
      id: crypto.randomUUID(),
      kind: 'location',
      lat,
      lng,
      radiusM,
      mode,
      label,
      createdAt: Date.now()
    }
    set((state) => {
      const rules = [...state.rules, rule]
      return afterLocalRulesChange(state, set, get, rules)
    })
  },

  removeRule: (id) => {
    set((state) => {
      const rule = state.rules.find((r) => r.id === id)
      if (rule && isStrictRuleDeleteLocked(rule)) return state
      const rules = state.rules.filter((rule) => rule.id !== id)
      return afterLocalRulesChange(state, set, get, rules)
    })
  },

  setManualMode: (mode) => {
    saveManualMode(mode)
    set((state) => {
      const next = { ...state, manualMode: mode }
      return { ...next, ...recomputeMatch(next) }
    })
  },

  // Called by useContextDetector when a new SSID is polled from the main process.
  // Updates `currentWifi`, then re-runs matchContextRule so activeMode / contextSource
  // change immediately if the network matches a saved WiFi rule (unless manualMode is set).
  setCurrentWifi: (ssid) => {
    set((state) => applyMatchPatch(state, get, set, { currentWifi: ssid }))
  },

  setCurrentLocation: (location, error = null) => {
    set((state) =>
      applyMatchPatch(state, get, set, { currentLocation: location, locationError: error })
    )
  },

  applyContextMatch: () => {
    set((state) => ({ ...state, ...recomputeMatch(state) }))
  }
}))
