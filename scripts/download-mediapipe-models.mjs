import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const destDir = join(root, 'src', 'renderer', 'public', 'models')

const MODELS = [
  {
    file: 'face_landmarker.task',
    url: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'
  },
  {
    file: 'pose_landmarker_lite.task',
    url: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task'
  }
]

async function downloadModel({ file, url }) {
  const dest = join(destDir, file)
  if (existsSync(dest)) {
    console.log(`[download-mediapipe-models] skip ${file} (already exists)`)
    return true
  }

  console.log(`[download-mediapipe-models] downloading ${file}...`)
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`)
  }

  const buffer = Buffer.from(await res.arrayBuffer())
  writeFileSync(dest, buffer)
  console.log(`[download-mediapipe-models] saved ${file} (${(buffer.length / 1024 / 1024).toFixed(1)} MB)`)
  return true
}

async function main() {
  mkdirSync(destDir, { recursive: true })

  let failed = 0
  for (const model of MODELS) {
    try {
      await downloadModel(model)
    } catch (err) {
      failed += 1
      const msg = err instanceof Error ? err.message : String(err)
      console.warn(`[download-mediapipe-models] failed ${model.file}: ${msg}`)
      console.warn(`  manual: ${model.url}`)
    }
  }

  if (failed > 0) {
    console.warn(
      `[download-mediapipe-models] ${failed} model(s) missing — retry with: npm run setup:models`
    )
    process.exit(0)
  }

  console.log('[download-mediapipe-models] all models ready in src/renderer/public/models/')
}

main().catch((err) => {
  console.warn('[download-mediapipe-models] unexpected error:', err)
  process.exit(0)
})
