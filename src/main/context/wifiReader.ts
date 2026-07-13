import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

function parseWindowsSsid(stdout: string): string | null {
  for (const line of stdout.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (/^SSID\s*:/i.test(trimmed) && !/BSSID/i.test(trimmed)) {
      const ssid = trimmed.split(':').slice(1).join(':').trim()
      if (ssid && ssid !== 'N/A') return ssid
    }
  }
  return null
}

function parseMacSsid(stdout: string): string | null {
  const trimmed = stdout.trim()
  if (!trimmed || /not associated|not connected|you are not/i.test(trimmed)) {
    return null
  }
  const match = trimmed.match(/Current Wi-Fi Network:\s*(.+)$/i)
  if (match?.[1]) return match[1].trim()
  const ssidMatch = trimmed.match(/\bSSID:\s*(.+)$/im)
  if (ssidMatch?.[1]) return ssidMatch[1].trim()
  return trimmed.length > 0 ? trimmed : null
}

function parseLinuxSsid(stdout: string): string | null {
  const match = stdout.match(/active-access-point:[^\n]*\n(?:.*\n)*?  ssid:(.+)$/im)
  if (match?.[1]) return match[1].trim()
  const simple = stdout.match(/^\s*SSID:\s*(.+)$/im)
  if (simple?.[1]) return simple[1].trim()
  return null
}

export async function getWifiSSID(): Promise<string | null> {
  try {
    if (process.platform === 'win32') {
      const { stdout } = await execFileAsync('netsh', ['wlan', 'show', 'interfaces'], {
        windowsHide: true
      })
      return parseWindowsSsid(stdout)
    }

    if (process.platform === 'darwin') {
      try {
        const { stdout } = await execFileAsync('/usr/sbin/networksetup', [
          '-getairportnetwork',
          'en0'
        ])
        return parseMacSsid(stdout)
      } catch {
        const { stdout } = await execFileAsync(
          '/System/Library/PrivateFrameworks/Apple80211.framework/Versions/Current/Resources/airport',
          ['-I']
        )
        return parseMacSsid(stdout)
      }
    }

    if (process.platform === 'linux') {
      const { stdout } = await execFileAsync('nmcli', ['-t', '-f', 'active,ssid', 'dev', 'wifi'])
      const active = stdout
        .split('\n')
        .map((line) => line.trim())
        .find((line) => line.startsWith('yes:'))
      if (active) return active.slice(4).trim() || null

      const { stdout: devOut } = await execFileAsync('nmcli', ['-t', '-f', 'general', 'dev', 'show'])
      return parseLinuxSsid(devOut)
    }

    console.warn('[wifiReader] unsupported platform:', process.platform)
    return null
  } catch (err) {
    console.warn('[wifiReader] failed to read SSID:', err)
    return null
  }
}
