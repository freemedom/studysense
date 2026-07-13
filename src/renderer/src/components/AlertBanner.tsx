import { useSessionStore } from '../store/sessionStore'

export default function AlertBanner(): React.JSX.Element {
  const alertMessage = useSessionStore((s) => s.alertMessage)

  return (
    <div className="alert-banner-slot" aria-live="polite">
      {alertMessage ? <div className="alert-banner">{alertMessage}</div> : null}
    </div>
  )
}
