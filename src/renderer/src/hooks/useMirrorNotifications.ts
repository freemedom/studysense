import { useEffect, useRef } from 'react'
import {
  APP_NOTIFICATION_TITLE,
  BREAK_NOTIFICATION_BODY,
  BREAK_NOTIFICATION_TITLE
} from '../constants/alertCopy'
import { NOTIFICATION_COOLDOWN_MS } from '../constants/thresholds'
import { useSessionStore } from '../store/sessionStore'

interface MirrorAlert {
  tag: string
  title: string
  body: string
}

interface MirrorState {
  isRunning: boolean
  showBreak: boolean
  alertMessage: string | null
}

function resolveActiveAlert(state: MirrorState): MirrorAlert | null {
  if (!state.isRunning) return null

  if (state.showBreak) {
    return {
      tag: 'break',
      title: BREAK_NOTIFICATION_TITLE,
      body: BREAK_NOTIFICATION_BODY
    }
  }

  if (state.alertMessage) {
    return {
      tag: `alert:${state.alertMessage}`,
      title: APP_NOTIFICATION_TITLE,
      body: state.alertMessage
    }
  }

  return null
}

function pickMirrorState(state: ReturnType<typeof useSessionStore.getState>): MirrorState {
  return {
    isRunning: state.isRunning,
    showBreak: state.showBreak,
    alertMessage: state.alertMessage
  }
}

export function useMirrorNotifications(): void {
  const lastActiveKey = useRef<string | null>(null)
  const lastSentKey = useRef<string | null>(null)
  const lastSentAt = useRef(0)

  useEffect(() => {
    const maybeNotify = (state: ReturnType<typeof useSessionStore.getState>): void => {
      const active = resolveActiveAlert(pickMirrorState(state))
      const activeKey = active?.tag ?? null

      if (activeKey === lastActiveKey.current) return

      lastActiveKey.current = activeKey
      if (!active) return

      const now = Date.now()
      if (
        active.tag === lastSentKey.current &&
        now - lastSentAt.current < NOTIFICATION_COOLDOWN_MS
      ) {
        return
      }

      void window.api.showNotification({
        title: active.title,
        body: active.body,
        tag: active.tag
      })

      lastSentKey.current = active.tag
      lastSentAt.current = now
    }

    const unsubscribe = useSessionStore.subscribe((state, prevState) => {
      const next = pickMirrorState(state)
      const prev = pickMirrorState(prevState)
      if (
        next.isRunning === prev.isRunning &&
        next.showBreak === prev.showBreak &&
        next.alertMessage === prev.alertMessage
      ) {
        return
      }
      maybeNotify(state)
    })

    maybeNotify(useSessionStore.getState())

    return () => {
      unsubscribe()
      lastActiveKey.current = null
      lastSentKey.current = null
      lastSentAt.current = 0
    }
  }, [])
}
