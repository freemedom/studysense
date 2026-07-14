# StudySense

A camera-based study assistant for laptop webcams. Built with Electron, React, and TypeScript.

- **Desktop (this repo)** — real-time vision: blinks, mood/fatigue, screen distance, posture
- **[Mobile companion](https://github.com/freemedom/studysense-mobile)** — WiFi / location context rules on Android / iOS
- **Cloud (optional)** — Supabase sync for context rules between desktop and mobile

All vision processing runs **locally in the renderer**; camera frames are not uploaded.

## Demo

- [Project slides]
- [Demo video]

## Features

### Vision (Live tab)

- **Blink counting** — EAR-based detection with per-minute rate
- **Mood & fatigue** — `focused`, `tired`, `restless`, `distracted` from blendshapes, gaze, head movement, and posture cues
- **Screen distance** — face-width ratio with too-close / too-far reminders
- **Posture** — forward head, head tilt, uneven shoulders via MediaPipe Pose (upper-body / laptop webcam)
- **Advanced panel** — raw signals for tuning and debugging (EAR, gaze down, head down, distracted hold, etc.)

### Session

- **Calibration** — 5-second personalized posture baseline before each session
- **Break overlay** — suggests a short break when fatigue cues combine with poor distance
- **Session history** — recent sessions with duration, blinks, mood events, and posture alerts by type

### Context (Context tab)

- **WiFi / location rules** — auto-switch study mode badge (`strict` / `study` / `relax`)
- **Manual lock** — override auto-detection or return to auto
- **Cloud sync (optional)** — share rules between desktop and mobile via Supabase

Context mode currently updates the **mode badge and UI state only** — it does not tune vision thresholds or alerts. It is intended for future app-restriction workflows (blocklist / allowlist).

## Quick start

```bash
npm install
npm run dev
```

Build platform packages:

```bash
npm run build:win    # Windows
npm run build:mac    # macOS
npm run build:linux  # Linux
```

## Using StudySense

1. **Start session** from the header — posture calibration runs for 5 seconds
2. **Live tab** — mood, blinks, distance, posture, and optional Advanced details
3. **History tab** — current session stats and saved session summaries
4. **Stop session** — writes a summary to local storage

### Webcam tips (laptop, upper body)

- Position the camera at eye level, 50–70 cm away
- Keep **both shoulders** visible in the frame (above the elbows)
- Sit straight during the 5 s calibration — that pose becomes your personal baseline

## Context modes

StudySense can detect where you are studying and switch the active **study mode** badge:

1. **WiFi rules** — bind the current SSID to a mode (read via Electron main process; Windows / macOS / Linux)
2. **Location rules** — bind a GPS coordinate + radius (meters) to a mode
3. **Manual override** — lock a mode or return to auto-detection

Rules are stored in `localStorage`.

**Matching priority:** manual lock → strictest among all matched WiFi/location rules (`strict` > `study` > `relax`) → default (`relax` when nothing matches).

### Cloud sync (optional)

WiFi / location **rules** can sync between desktop and mobile via Supabase. Manual mode is **not** synced.

1. Create a [Supabase](https://supabase.com) project.
2. In the SQL Editor, run [`supabase/context_sync.sql`](supabase/context_sync.sql).
3. Copy `.env.example` to `.env` and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
4. Restart `npm run dev`. In **Context** → **Cloud sync**, use **Create sync code** on one device and **Join sync** on the other with the same token.

Sync uses last-write-wins on the full rules snapshot. The sync token is the shared secret — do not commit `.env` or share the anon key publicly.

When paired, each device also reports its **auto-matched** mode to `peer_modes`; the displayed mode is the strictest among local auto-match and peer devices (manual lock stays local-only). If you created `context_sync` before this feature, run [`supabase/context_sync_peer_modes.sql`](supabase/context_sync_peer_modes.sql) in the SQL Editor.

### Permissions

| Signal | Requirement |
|--------|-------------|
| WiFi SSID | Wireless connection; wired Ethernet shows “no WiFi” |
| Location (macOS) | System Settings → Privacy → Location Services → allow StudySense |
| Location (Windows) | (1) Windows Settings → Privacy → Location → allow desktop apps; (2) set `GOOGLE_API_KEY` — see below |

#### Windows geolocation and `403` from `googleapis.com`

On **Windows**, Electron/Chromium calls [Google's Geolocation API](https://developers.google.com/maps/documentation/geolocation/overview) instead of OS GPS. Without an API key you may see:

```text
Network location provider at 'https://www.googleapis.com/' : Returned error code 403
```

**Fix (optional — only for location-based rules):**

1. In [Google Cloud Console](https://console.cloud.google.com/), enable **Geolocation API** and create an API key.
2. Set the environment variable before starting the app:

```powershell
# PowerShell (session)
$env:GOOGLE_API_KEY = "your-api-key"
npm run dev
```

```bash
# macOS / Linux
export GOOGLE_API_KEY="your-api-key"
npm run dev
```

If you skip this step, **WiFi rules and manual mode still work**; the app avoids calling `getCurrentPosition` on Windows and shows a hint in the Context panel instead of spamming 403 errors.

Context polling interval: 30 seconds (`CONTEXT_POLL_MS`).

## Model files

MediaPipe models are **downloaded automatically** on `npm install` into `src/renderer/public/models/`.

If a download fails (offline / firewall):

```bash
npm run setup:models
```

| File | Source |
|------|--------|
| `face_landmarker.task` | Google MediaPipe storage (face landmarker float16) |
| `pose_landmarker_lite.task` | Google MediaPipe storage (pose landmarker lite float16) |

WASM binaries are copied on `npm install` to `src/renderer/public/wasm/`.

## Research tooling (optional)

Script that role-plays student profiles to answer a StudySense questionnaire — for early need exploration only.

```bash
# Uses LLM_API_KEY / OPENAI_API_KEY from .env
npm run simulate:questionnaire

npm run simulate:questionnaire -- --count 24   # sample size
npm run simulate:questionnaire -- --mock       # offline, no API key
```

Outputs: `slides/questionnaire_probe_simulation.{json,csv}` and `slides/questionnaire_probe_simulation_summary.md`.

## Development

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Electron dev server |
| `npm run typecheck` | TypeScript check (node + web) |
| `npm run lint` | ESLint |
| `npm run format` | Prettier |
| `npm run build:win` / `build:mac` / `build:linux` | Platform builds |

Recommended editor: VS Code or Cursor with ESLint and Prettier extensions. Code style is enforced via `eslint.config.mjs`, `.prettierrc.yaml`, and `.editorconfig` in the repo root.
