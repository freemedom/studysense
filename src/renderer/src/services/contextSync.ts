import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import {
  SYNC_DEVICE_ID_KEY,
  SYNC_LOCAL_UPDATED_AT_KEY,
  SYNC_TOKEN_STORAGE_KEY
} from '../constants/thresholds'
import type { ContextRule, PeerModeEntry, StudyMode } from '../types/context'

const TABLE = 'context_sync'

type RemoteRow = {
  sync_token: string
  rules: unknown
  updated_at: number
  peer_modes: unknown
}

export type SyncApplyResult =
  | { action: 'pulled'; rules: ContextRule[]; updatedAt: number }
  | { action: 'pushed'; updatedAt: number }
  | { action: 'noop' }
  | { action: 'conflict' }
  | { action: 'error'; message: string }

let client: SupabaseClient | null = null

function getSupabase(): SupabaseClient | null {
  if (client) return client
  const url = import.meta.env.VITE_SUPABASE_URL
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) return null
  client = createClient(url, key)
  return client
}

export function isSupabaseConfigured(): boolean {
  return Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY)
}

export function maskSyncToken(token: string): string {
  if (token.length <= 10) return token
  return `${token.slice(0, 4)}…${token.slice(-4)}`
}

export function getSyncToken(): string | null {
  return localStorage.getItem(SYNC_TOKEN_STORAGE_KEY)
}

export function saveSyncToken(token: string): void {
  localStorage.setItem(SYNC_TOKEN_STORAGE_KEY, token.trim())
}

export function clearSyncToken(): void {
  localStorage.removeItem(SYNC_TOKEN_STORAGE_KEY)
}

export function getOrCreateDeviceId(): string {
  const existing = localStorage.getItem(SYNC_DEVICE_ID_KEY)
  if (existing) return existing
  const id = crypto.randomUUID()
  localStorage.setItem(SYNC_DEVICE_ID_KEY, id)
  return id
}

export function getLocalUpdatedAt(): number {
  const raw = localStorage.getItem(SYNC_LOCAL_UPDATED_AT_KEY)
  if (!raw) return 0
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : 0
}

export function bumpLocalUpdatedAt(now = Date.now()): number {
  localStorage.setItem(SYNC_LOCAL_UPDATED_AT_KEY, String(now))
  return now
}

export function setLocalUpdatedAt(value: number): void {
  localStorage.setItem(SYNC_LOCAL_UPDATED_AT_KEY, String(value))
}

function isStudyMode(value: unknown): value is StudyMode {
  return value === 'strict' || value === 'study' || value === 'relax'
}

export function parseContextRules(raw: unknown): ContextRule[] | null {
  if (!Array.isArray(raw)) return null
  const rules: ContextRule[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') return null
    const record = item as Record<string, unknown>
    if (typeof record.id !== 'string' || !isStudyMode(record.mode)) return null
    const label = typeof record.label === 'string' ? record.label : undefined
    const createdAt = typeof record.createdAt === 'number' ? record.createdAt : undefined
    if (record.kind === 'wifi') {
      if (typeof record.ssid !== 'string') return null
      rules.push({ id: record.id, kind: 'wifi', ssid: record.ssid, mode: record.mode, label, createdAt })
      continue
    }
    if (record.kind === 'location') {
      if (
        typeof record.lat !== 'number' ||
        typeof record.lng !== 'number' ||
        typeof record.radiusM !== 'number'
      ) {
        return null
      }
      rules.push({
        id: record.id,
        kind: 'location',
        lat: record.lat,
        lng: record.lng,
        radiusM: record.radiusM,
        mode: record.mode,
        label,
        createdAt
      })
      continue
    }
    return null
  }
  return rules
}

export function parsePeerModes(raw: unknown): Record<string, PeerModeEntry> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const parsed: Record<string, PeerModeEntry> = {}
  for (const [deviceId, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null
    const record = value as Record<string, unknown>
    const mode = record.mode
    const updatedAt =
      typeof record.updated_at === 'number'
        ? record.updated_at
        : typeof record.updatedAt === 'number'
          ? record.updatedAt
          : null
    if (!isStudyMode(mode) || updatedAt === null) return null
    parsed[deviceId] = { mode, updatedAt }
  }
  return parsed
}

function peerModesToDb(peerModes: Record<string, PeerModeEntry>): Record<string, { mode: StudyMode; updated_at: number }> {
  const out: Record<string, { mode: StudyMode; updated_at: number }> = {}
  for (const [deviceId, entry] of Object.entries(peerModes)) {
    out[deviceId] = { mode: entry.mode, updated_at: entry.updatedAt }
  }
  return out
}

function createSyncToken(): string {
  return crypto.randomUUID()
}

async function fetchRemoteRow(token: string): Promise<RemoteRow | null> {
  const supabase = getSupabase()
  if (!supabase) return null
  const { data, error } = await supabase
    .from(TABLE)
    .select('sync_token, rules, updated_at, peer_modes')
    .eq('sync_token', token)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return null
  return data as RemoteRow
}

export async function createSyncGroup(
  rules: ContextRule[]
): Promise<{ token: string } | { error: string }> {
  const supabase = getSupabase()
  if (!supabase) return { error: 'Supabase not configured' }
  const token = createSyncToken()
  const updatedAt = bumpLocalUpdatedAt()
  const { error } = await supabase.from(TABLE).upsert({
    sync_token: token,
    rules,
    updated_at: updatedAt,
    peer_modes: {}
  })
  if (error) return { error: error.message }
  saveSyncToken(token)
  return { token }
}

export async function joinSyncGroup(
  token: string
): Promise<{ ok: true } | { error: string }> {
  const trimmed = token.trim()
  if (!trimmed) return { error: 'Please enter a sync code' }
  const supabase = getSupabase()
  if (!supabase) return { error: 'Supabase not configured' }
  try {
    const remote = await fetchRemoteRow(trimmed)
    if (!remote) return { error: 'Invalid or missing sync code' }
    saveSyncToken(trimmed)
    return { ok: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to join sync' }
  }
}

export async function pullRules(): Promise<SyncApplyResult> {
  const token = getSyncToken()
  if (!token) return { action: 'noop' }
  const supabase = getSupabase()
  if (!supabase) return { action: 'error', message: 'Supabase not configured' }
  try {
    const remote = await fetchRemoteRow(token)
    if (!remote) return { action: 'error', message: 'Sync group not found in cloud' }
    const localUpdatedAt = getLocalUpdatedAt()
    if (remote.updated_at <= localUpdatedAt) return { action: 'noop' }
    const rules = parseContextRules(remote.rules)
    if (!rules) return { action: 'error', message: 'Invalid cloud rules format' }
    setLocalUpdatedAt(remote.updated_at)
    return { action: 'pulled', rules, updatedAt: remote.updated_at }
  } catch (err) {
    return { action: 'error', message: err instanceof Error ? err.message : 'Pull failed' }
  }
}

export async function pushRules(rules: ContextRule[]): Promise<SyncApplyResult> {
  const token = getSyncToken()
  if (!token) return { action: 'noop' }
  const supabase = getSupabase()
  if (!supabase) return { action: 'error', message: 'Supabase not configured' }
  try {
    const remote = await fetchRemoteRow(token)
    const localUpdatedAt = getLocalUpdatedAt()
    if (remote && remote.updated_at > localUpdatedAt) {
      return { action: 'conflict' }
    }
    const updatedAt = bumpLocalUpdatedAt()
    const peerModesPayload = remote
      ? peerModesToDb(parsePeerModes(remote.peer_modes) ?? {})
      : {}
    const { error } = await supabase.from(TABLE).upsert({
      sync_token: token,
      rules,
      updated_at: updatedAt,
      peer_modes: peerModesPayload
    })
    if (error) return { action: 'error', message: error.message }
    return { action: 'pushed', updatedAt }
  } catch (err) {
    return { action: 'error', message: err instanceof Error ? err.message : 'Push failed' }
  }
}

export async function syncRules(localRules: ContextRule[]): Promise<SyncApplyResult> {
  const pulled = await pullRules()
  if (pulled.action === 'pulled') return pulled
  if (pulled.action === 'error') return pulled
  return pushRules(localRules)
}

export async function pullPeerModes(): Promise<
  { peerModes: Record<string, PeerModeEntry> } | { error: string }
> {
  const token = getSyncToken()
  if (!token) return { peerModes: {} }
  try {
    const remote = await fetchRemoteRow(token)
    if (!remote) return { error: 'Sync group not found in cloud' }
    const peerModes = parsePeerModes(remote.peer_modes)
    if (!peerModes) return { error: 'Invalid cloud mode format' }
    return { peerModes }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to pull modes' }
  }
}

export async function pushPeerMode(
  deviceId: string,
  mode: StudyMode,
  existingPeerModes: Record<string, PeerModeEntry>
): Promise<{ peerModes: Record<string, PeerModeEntry> } | { error: string }> {
  const token = getSyncToken()
  if (!token) return { peerModes: existingPeerModes }
  const supabase = getSupabase()
  if (!supabase) return { error: 'Supabase not configured' }
  try {
    const remote = await fetchRemoteRow(token)
    if (!remote) return { error: 'Sync group not found in cloud' }
    const remotePeerModes = parsePeerModes(remote.peer_modes) ?? {}
    const nextPeerModes = {
      ...remotePeerModes,
      [deviceId]: { mode, updatedAt: Date.now() }
    }
    const { error } = await supabase
      .from(TABLE)
      .update({ peer_modes: peerModesToDb(nextPeerModes) })
      .eq('sync_token', token)
    if (error) return { error: error.message }
    return { peerModes: nextPeerModes }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to push modes' }
  }
}
