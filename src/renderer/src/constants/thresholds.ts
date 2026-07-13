export const BLINK_EAR_THRESHOLD = 0.21
export const BLINK_RATE_LOW = 10
export const EAR_TIRED = 0.14 // look down will cause ear ratio to be lower
export const HEAD_JITTER_RESTLESS = 0.05
export const BROW_RESTLESS = 0.2
export const MOUTH_TENSION_RESTLESS = 0.1
export const JAW_OPEN_YAWN = 0.35
export const JAW_OPEN_SUSTAIN_RATIO = 0.4
export const GAZE_DOWN_DISTRACTED = 0.6
export const HEAD_DOWN_DISTRACTED_DELTA = 0.06
export const NOSE_Y_DOWN_DISTRACTED = 0.025
export const NOSE_BASELINE_MS = 10_000
export const MOOD_BLINK_WARMUP_MS = 20_000
export const MOOD_HOLD_MS = 1_500
export const MOOD_SMOOTH_MS = 2_000
export const EAR_TIRED_SUSTAIN_RATIO = 0.55
export const FACE_RATIO_NEAR = 0.42
export const FACE_RATIO_FAR = 0.20
export const FATIGUE_BREAK_SECONDS = 20
export const BLINK_HISTORY_MS = 60_000
export const SESSIONS_STORAGE_KEY = 'studylens_sessions'
export const SESSION_HISTORY_MAX = 50

export const POSTURE_CALIBRATION_MS = 5000
export const FORWARD_RATIO_DELTA = 0.12
export const HEAD_OFFSET_DELTA = 0.06
export const SHOULDER_UNEVEN_DELTA = 0.04
export const POSTURE_ALERT_HOLD_MS = 3000

/** @deprecated No longer used for classification; kept for debug display compatibility. */
export const FORWARD_HEAD_DELTA = 12
/** @deprecated No longer used for classification; kept for debug display compatibility. */
export const HEAD_TILT_DELTA = 8
/** @deprecated No longer used for classification; kept for debug display compatibility. */
export const SHOULDER_UNEVEN_RATIO = 0.08

/** Fallback when calibration collects too few valid frames. */
export const DEFAULT_NECK_ANGLE_DEG = 15
export const DEFAULT_SHOULDER_TILT_DEG = 0
export const DEFAULT_FORWARD_RATIO = -0.25
export const DEFAULT_HEAD_OFFSET_RATIO = 0.05
export const DEFAULT_SHOULDER_UNEVEN_RATIO = 0.03

export const CONTEXT_POLL_MS = 30_000
export const CONTEXT_RULES_STORAGE_KEY = 'studylens_context_rules'
export const MANUAL_MODE_STORAGE_KEY = 'studylens_manual_mode'
export const DEFAULT_LOCATION_RADIUS_M = 300
export const STRICT_RULE_DELETE_LOCK_MS = 20_000

export const SYNC_TOKEN_STORAGE_KEY = 'studylens_sync_token'
export const SYNC_LOCAL_UPDATED_AT_KEY = 'studylens_sync_local_updated_at'
export const SYNC_POLL_MS = 30_000
export const SYNC_PUSH_DEBOUNCE_MS = 500
export const SYNC_DEVICE_ID_KEY = 'studylens_sync_device_id'
