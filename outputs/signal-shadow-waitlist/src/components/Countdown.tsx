import { useEffect, useMemo, useState } from 'react'
import { buildReferralUrl } from '../lib/waitlist'
import { getNovember18Target, getTimeParts } from '../lib/time'

type CountdownProps = {
  displayId: string
  referralCode: string
}

export default function Countdown({ displayId, referralCode }: CountdownProps) {
  const target = useMemo(() => getNovember18Target(), [])
  const [now, setNow] = useState(() => Date.now())
  const [copied, setCopied] = useState(false)
  const parts = getTimeParts(target.getTime() - now)
  const referralLink = buildReferralUrl(window.location.origin, referralCode)

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(interval)
  }, [])

  const copyLink = async () => {
    await navigator.clipboard?.writeText(referralLink)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  return (
    <section className="reveal-panel" data-testid="countdown" aria-label="Release signal">
      <p className="section-kicker">Release signal</p>
      <div className="countdown-grid" role="timer" aria-live="polite">
        <CountdownUnit label="days" value={parts.days} width={3} />
        <CountdownUnit label="hours" value={parts.hours} width={2} />
        <CountdownUnit label="minutes" value={parts.minutes} width={2} />
        <CountdownUnit label="seconds" value={parts.seconds} width={2} />
      </div>

      <div className="identity-strip">
        <div>
          <span className="identity-label">Player ID</span>
          <strong>{displayId}</strong>
        </div>
        <div className="referral-row">
          <span>{referralLink}</span>
          <button type="button" className="ghost-button" onClick={copyLink}>
            {copied ? 'Copied' : 'Copy Link'}
          </button>
        </div>
      </div>
    </section>
  )
}

function CountdownUnit({ label, value, width }: { label: string; value: number; width: number }) {
  const digits = value.toString().padStart(width, '0').split('')

  return (
    <div className="countdown-unit">
      <div className="digit-row" aria-label={`${value} ${label}`}>
        {digits.map((digit, index) => (
          <span
            className="digit-window"
            key={`${label}-${index}`}
            style={{ '--digit': digit, '--delay': `${index * 90}ms` } as React.CSSProperties}
            aria-hidden="true"
          >
            <span>{digit}</span>
          </span>
        ))}
      </div>
      <span className="countdown-label">{label}</span>
    </div>
  )
}
