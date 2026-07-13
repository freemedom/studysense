import { useEffect } from 'react'
import { CONTEXT_POLL_MS } from '../constants/thresholds'
import { useContextStore } from '../store/contextStore'
import type { GeoPoint } from '../types/context'

type GeolocationReadResult =
  | { ok: true; point: GeoPoint }
  | { ok: false; message: string }

function geolocationErrorMessage(code: number, platform: NodeJS.Platform): string {
  if (code === 1) return 'Location permission denied — allow location access in system settings'
  if (code === 3) return 'Location request timed out'
  if (code === 2 && platform === 'win32') {
    return 'Windows location failed — set GOOGLE_API_KEY (Google Geolocation API), or use WiFi rules only'
  }
  if (code === 2) return 'Location services unavailable'
  return 'Location unavailable or not authorized'
}

function readGeolocation(platform: NodeJS.Platform): Promise<GeolocationReadResult> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve({ ok: false, message: 'Geolocation not supported in this browser' })
      return
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          ok: true,
          point: { lat: pos.coords.latitude, lng: pos.coords.longitude }
        })
      },
      (err) => {
        resolve({ ok: false, message: geolocationErrorMessage(err.code, platform) })
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: CONTEXT_POLL_MS } // more accurate position
    )
  })
}

export function useContextDetector(): void {
  const setCurrentWifi = useContextStore((s) => s.setCurrentWifi)
  const setCurrentLocation = useContextStore((s) => s.setCurrentLocation)
  const loadPersisted = useContextStore((s) => s.loadPersisted)
  const syncNow = useContextStore((s) => s.syncNow)
  const syncToken = useContextStore((s) => s.syncToken)

  // On mount: restore WiFi/location rules and manual mode override from localStorage,
  // then recompute activeMode before the first WiFi/geolocation poll runs.
  useEffect(() => {
    loadPersisted()
  }, [loadPersisted])

  useEffect(() => {
    let cancelled = false

    async function poll(): Promise<void> {
      try {
        const ssid = await window.api.getWifiSSID()
        if (!cancelled) setCurrentWifi(ssid)
      } catch {
        if (!cancelled) setCurrentWifi(null)
      }

      const platform = await window.api.getPlatform()
      const geoReady = await window.api.isGeolocationConfigured()

      if (!geoReady && platform === 'win32') {
        if (!cancelled) {
          setCurrentLocation(
            null,
            'Windows location requires GOOGLE_API_KEY (see README); WiFi / manual mode only for now'
          )
        }
      } else {
        const result = await readGeolocation(platform)
        if (cancelled) return

        if (result.ok) {
          setCurrentLocation(result.point, null)
        } else {
          setCurrentLocation(null, result.message)
        }
      }

      if (!cancelled && syncToken) {
        void syncNow()
      }
    }

    poll()
    const timer = window.setInterval(poll, CONTEXT_POLL_MS)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [setCurrentWifi, setCurrentLocation, syncToken, syncNow])
}
