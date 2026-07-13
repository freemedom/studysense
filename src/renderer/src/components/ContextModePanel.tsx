import { useEffect, useState } from 'react'
import {
  CONTEXT_SOURCE_SYNC,
  LOCATION_RADIUS_LABEL,
  STRICT_RULE_DELETE_NOTICE,
  SYNC_CONFLICT_NOTICE,
  SYNC_CREATE_BTN,
  SYNC_DISCONNECT_BTN,
  SYNC_JOIN_BTN,
  SYNC_JOIN_PLACEHOLDER,
  SYNC_LAST_SYNCED,
  SYNC_NEVER,
  SYNC_NOW_BTN,
  SYNC_PAIRED_HINT,
  SYNC_SECTION_TITLE,
  SYNC_TOKEN_COPIED,
  SYNC_UNCONFIGURED_HINT
} from '../context/contextCopy'
import { getModeLabel, STUDY_MODES } from '../context/modeProfiles'
import { buildOpenStreetMapUrl } from '../context/openStreetMapUrl'
import { isStrictRuleDeleteLocked } from '../context/ruleDeleteLock'
import { DEFAULT_LOCATION_RADIUS_M } from '../constants/thresholds'
import { maskSyncToken } from '../services/contextSync'
import { useContextStore } from '../store/contextStore'
import type { ContextRule, StudyMode } from '../types/context'

function formatSyncTime(ts: number | null): string {
  if (!ts) return SYNC_NEVER
  return new Date(ts).toLocaleString(undefined, {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  })
}

function ruleSummary(rule: ContextRule): string {
  if (rule.kind === 'wifi') {
    return `WiFi: ${rule.ssid} → ${getModeLabel(rule.mode)}`
  }
  return `Location: ${rule.lat.toFixed(4)}, ${rule.lng.toFixed(4)} (${rule.radiusM}m) → ${getModeLabel(rule.mode)}`
}

export default function ContextModePanel(): React.JSX.Element {
  const activeMode = useContextStore((s) => s.activeMode)
  const contextSource = useContextStore((s) => s.contextSource)
  const matchedRuleId = useContextStore((s) => s.matchedRuleId)
  const currentWifi = useContextStore((s) => s.currentWifi)
  const currentLocation = useContextStore((s) => s.currentLocation)
  const locationError = useContextStore((s) => s.locationError)
  const manualMode = useContextStore((s) => s.manualMode)
  const rules = useContextStore((s) => s.rules)
  const addWifiRule = useContextStore((s) => s.addWifiRule)
  const addLocationRule = useContextStore((s) => s.addLocationRule)
  const removeRule = useContextStore((s) => s.removeRule)
  const setManualMode = useContextStore((s) => s.setManualMode)
  const syncToken = useContextStore((s) => s.syncToken)
  const syncStatus = useContextStore((s) => s.syncStatus)
  const syncError = useContextStore((s) => s.syncError)
  const lastSyncedAt = useContextStore((s) => s.lastSyncedAt)
  const createSync = useContextStore((s) => s.createSync)
  const joinSync = useContextStore((s) => s.joinSync)
  const disconnectSync = useContextStore((s) => s.disconnectSync)
  const syncNow = useContextStore((s) => s.syncNow)

  const [joinTokenInput, setJoinTokenInput] = useState('')
  const [syncNotice, setSyncNotice] = useState<string | null>(null)

  // Local form state for "add rule" / manual-lock controls (not the global `activeMode`).
  // Defaults pre-select sensible modes before the user clicks "Add rule" or "Lock".
  /**
   * React useState — component-local state that survives re-renders.
   *
   * Syntax: const [value, setValue] = useState(initial)
   * - `useState('study')` creates state with initial value `'study'`.
   * - Returns a 2-item array; we destructure it into:
   *     wifiMode      — current value (read in JSX, e.g. <select value={wifiMode}>)
   *     setWifiMode   — updater function; call it with the new value to change
   *                     wifiMode and trigger a re-render (e.g. on dropdown change).
   * - `setWifiMode` is NOT called on this line — only declared. It runs later in
   *   onChange={(e) => setWifiMode(e.target.value as StudyMode)}.
   *
   * This is form UI state only; global active mode lives in contextStore.
   */
  const [wifiMode, setWifiMode] = useState<StudyMode>('study')
  const [locationMode, setLocationMode] = useState<StudyMode>('study')
  const [radiusM, setRadiusM] = useState(DEFAULT_LOCATION_RADIUS_M)
  const [manualSelection, setManualSelection] = useState<StudyMode>('study')
  const [now, setNow] = useState(() => Date.now())
  const [strictCreateNotice, setStrictCreateNotice] = useState(false)
  const matchedRule = rules.find((rule) => rule.id === matchedRuleId) ?? null

  useEffect(() => {
    const hasLocked = rules.some((rule) => isStrictRuleDeleteLocked(rule, now))
    if (!hasLocked) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [rules, now])

  useEffect(() => {
    if (!strictCreateNotice) return
    const timer = window.setTimeout(() => setStrictCreateNotice(false), 5000)
    return () => window.clearTimeout(timer)
  }, [strictCreateNotice])

  useEffect(() => {
    if (syncStatus !== 'conflict' && !syncNotice) return
    if (syncStatus === 'conflict') {
      setSyncNotice(SYNC_CONFLICT_NOTICE)
    }
  }, [syncStatus, syncNotice])

  useEffect(() => {
    if (!syncNotice) return
    const timer = window.setTimeout(() => setSyncNotice(null), 5000)
    return () => window.clearTimeout(timer)
  }, [syncNotice])

  function notifyIfStrictRule(mode: StudyMode): void {
    if (mode === 'strict') setStrictCreateNotice(true)
  }

  const sourceText =
    contextSource === 'wifi' && matchedRule?.kind === 'wifi'
      ? `WiFi "${matchedRule.ssid}"`
      : contextSource === 'location' && matchedRule?.kind === 'location'
        ? `Location radius ${matchedRule.radiusM}m`
        : contextSource === 'sync'
          ? CONTEXT_SOURCE_SYNC
          : contextSource === 'manual'
            ? 'Manual lock'
            : 'Default (no matching rules)'

  return (
    <div className="context-mode-panel">
      <div className="metric-card">
        <div className="metric-label">Current mode</div>
        <div className={`metric-badge mode-badge mode-badge-${activeMode}`}>
          {getModeLabel(activeMode)}
        </div>
        <div className="metric-hint">Source: {sourceText}</div>
      </div>

      <div className="metric-card context-status-card">
        <div className="metric-label">Current context</div>
        <div className="context-status-row">
          <span className="context-status-label">WiFi</span>
          <span className="context-status-value">{currentWifi ?? 'No WiFi detected'}</span>
        </div>
        <div className="context-status-row">
          <span className="context-status-label">Location</span>
          <span className="context-status-value">
            {currentLocation
              ? `${currentLocation.lat.toFixed(4)}, ${currentLocation.lng.toFixed(4)}`
              : locationError ?? 'No coordinates'}
          </span>
        </div>
        {currentLocation && (
          <a
            className="context-map-link"
            href={buildOpenStreetMapUrl(currentLocation.lat, currentLocation.lng)}
            target="_blank"
            rel="noreferrer"
          >
            View on map
          </a>
        )}
      </div>

      <div className="context-action-card">
        <div className="context-action-title">Bind current WiFi</div>
        <div className="context-action-row">
          <select
            className="context-select"
            value={wifiMode}
            onChange={(e) => setWifiMode(e.target.value as StudyMode)}
          >
            {STUDY_MODES.map((mode) => (
              <option key={mode} value={mode}>
                {getModeLabel(mode)}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn-ghost"
            disabled={!currentWifi}
            onClick={() => {
              if (!currentWifi) return
              addWifiRule(currentWifi, wifiMode)
              notifyIfStrictRule(wifiMode)
            }}
          >
            Add rule
          </button>
        </div>
      </div>

      <div className="context-action-card">
        <div className="context-action-title">Bind current location</div>
        <div className="context-action-row">
          <span className="context-field-label">{LOCATION_RADIUS_LABEL}</span>
          <input
            className="context-input"
            type="number"
            min={50}
            max={5000}
            step={50}
            value={radiusM}
            onChange={(e) => setRadiusM(Number(e.target.value) || DEFAULT_LOCATION_RADIUS_M)}
          />
          <span className="context-input-suffix">m</span>
          <select
            className="context-select"
            value={locationMode}
            onChange={(e) => setLocationMode(e.target.value as StudyMode)}
          >
            {STUDY_MODES.map((mode) => (
              <option key={mode} value={mode}>
                {getModeLabel(mode)}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn-ghost"
            disabled={!currentLocation}
            onClick={() => {
              if (!currentLocation) return
              addLocationRule(
                currentLocation.lat,
                currentLocation.lng,
                radiusM,
                locationMode
              )
              notifyIfStrictRule(locationMode)
            }}
          >
            Add rule
          </button>
        </div>
      </div>

      <div className="context-action-card context-sync-card">
        <div className="context-action-title">{SYNC_SECTION_TITLE}</div>
        {syncStatus === 'unconfigured' ? (
          <p className="metric-hint">{SYNC_UNCONFIGURED_HINT}</p>
        ) : syncToken ? (
          <>
            <div className="context-status-row">
              <span className="context-status-label">{SYNC_PAIRED_HINT}</span>
              <span className="context-status-value context-sync-token">{maskSyncToken(syncToken)}</span>
            </div>
            <div className="context-status-row">
              <span className="context-status-label">{SYNC_LAST_SYNCED}</span>
              <span className="context-status-value">{formatSyncTime(lastSyncedAt)}</span>
            </div>
            {syncStatus === 'syncing' && <p className="metric-hint">Syncing…</p>}
            {(syncError || syncNotice) && (
              <p className="metric-hint context-sync-error">{syncNotice ?? syncError}</p>
            )}
            <div className="context-action-row">
              <button type="button" className="btn-ghost" onClick={() => void syncNow()}>
                {SYNC_NOW_BTN}
              </button>
              <button type="button" className="btn-ghost" onClick={() => disconnectSync()}>
                {SYNC_DISCONNECT_BTN}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="context-action-row">
              <button
                type="button"
                className="btn-ghost"
                disabled={syncStatus === 'syncing'}
                onClick={() => {
                  void createSync().then((token) => {
                    if (!token) return
                    void navigator.clipboard.writeText(token)
                    setSyncNotice(SYNC_TOKEN_COPIED)
                  })
                }}
              >
                {SYNC_CREATE_BTN}
              </button>
            </div>
            <div className="context-action-row context-sync-join-row">
              <input
                className="context-input context-sync-input"
                type="text"
                placeholder={SYNC_JOIN_PLACEHOLDER}
                value={joinTokenInput}
                onChange={(e) => setJoinTokenInput(e.target.value)}
              />
              <button
                type="button"
                className="btn-ghost"
                disabled={!joinTokenInput.trim() || syncStatus === 'syncing'}
                onClick={() => {
                  void joinSync(joinTokenInput).then((ok) => {
                    if (ok) setJoinTokenInput('')
                  })
                }}
              >
                {SYNC_JOIN_BTN}
              </button>
            </div>
            {syncError && <p className="metric-hint context-sync-error">{syncError}</p>}
          </>
        )}
      </div>

      {rules.length > 0 && (
        <div className="context-rules">
          <h3>Saved rules</h3>
          {strictCreateNotice && (
            <p className="metric-hint">{STRICT_RULE_DELETE_NOTICE}</p>
          )}
          <ul>
            {rules.map((rule) => (
              <li key={rule.id}>
                <span>{ruleSummary(rule)}</span>
                <button
                  type="button"
                  className="btn-ghost"
                  disabled={isStrictRuleDeleteLocked(rule, now)}
                  onClick={() => removeRule(rule.id)}
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="context-action-card">
        <div className="context-action-title">Manual mode</div>
        <div className="context-action-row">
          <select
            className="context-select"
            value={manualSelection}
            onChange={(e) => setManualSelection(e.target.value as StudyMode)}
          >
            {STUDY_MODES.map((mode) => (
              <option key={mode} value={mode}>
                {getModeLabel(mode)}
              </option>
            ))}
          </select>
          <button type="button" className="btn-ghost" onClick={() => setManualMode(manualSelection)}>
            Lock
          </button>
          <button
            type="button"
            className="btn-ghost"
            disabled={manualMode === null}
            onClick={() => setManualMode(null)}
          >
            Auto
          </button>
        </div>
        {manualMode && (
          <div className="metric-hint">Manually locked to &quot;{getModeLabel(manualMode)}&quot;</div>
        )}
      </div>
    </div>
  )
}
