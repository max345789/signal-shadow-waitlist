import { FormEvent, useCallback, useMemo, useState } from 'react'
import Countdown from './components/Countdown'
import StudioIntro, { hasPlayedIntro } from './components/StudioIntro'
import { submitSignup } from './lib/supabase'
import { isValidEmail, normalizeEmail, readReferralCode, type SignupClient, type SignupResponse } from './lib/waitlist'
import './styles.css'

type AppProps = {
  forceIntroComplete?: boolean
  signupClient?: SignupClient
}

export default function App({ forceIntroComplete = false, signupClient = submitSignup }: AppProps) {
  const [introComplete, setIntroComplete] = useState(() => forceIntroComplete || hasPlayedIntro())
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [message, setMessage] = useState('')
  const [signup, setSignup] = useState<SignupResponse | null>(null)
  const referredBy = useMemo(() => readReferralCode(), [])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const normalizedEmail = normalizeEmail(email)

    if (!isValidEmail(normalizedEmail)) {
      setStatus('error')
      setMessage('Use a real email address so your player ID can reach you.')
      return
    }

    setStatus('loading')
    setMessage('')

    try {
      const response = await signupClient({
        email: normalizedEmail,
        referred_by: referredBy,
      })
      setSignup(response)
      setStatus('idle')
      setMessage('Your signal is locked. Save the ID below.')
    } catch (error) {
      setStatus('error')
      setMessage(error instanceof Error ? error.message : 'The signal failed. Try again in a moment.')
    }
  }

  const completeIntro = useCallback(() => setIntroComplete(true), [])

  return (
    <>
      {!introComplete && <StudioIntro onComplete={completeIntro} />}
      {introComplete && (
        <main className="page-shell">
          <div className="fog-layer" aria-hidden="true" />
          <header className="brand-ribbon">
            <span className="brand-mark" aria-hidden="true">MGS</span>
            <span>Maxwel Game Studio</span>
          </header>

          <section className="hero" aria-labelledby="hero-title">
            <div className="hero-copy">
              <p className="section-kicker">Pre-launch transmission</p>
              <h1 id="hero-title">Signal &amp; Shadow</h1>
              <p className="hook">A horror game you can only survive together.</p>
            </div>

            <form className="signup-form" onSubmit={handleSubmit} noValidate>
              <label htmlFor="email">Email</label>
              <div className="form-row">
                <input
                  id="email"
                  type="email"
                  value={email}
                  autoComplete="email"
                  placeholder="you@example.com"
                  onChange={(event) => setEmail(event.target.value)}
                  aria-invalid={status === 'error'}
                />
                <button type="submit" disabled={status === 'loading'}>
                  {status === 'loading' ? 'Tuning...' : 'Notify Me'}
                </button>
              </div>
              {message && (
                <p className={status === 'error' ? 'form-message form-message--error' : 'form-message'} role="status">
                  {message}
                </p>
              )}
            </form>
          </section>

          {signup && <Countdown displayId={signup.display_id} referralCode={signup.referral_code} />}
        </main>
      )}
    </>
  )
}
