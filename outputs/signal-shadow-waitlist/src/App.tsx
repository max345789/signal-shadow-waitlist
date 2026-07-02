import { FormEvent, useCallback, useMemo, useState } from 'react'
import Countdown from './components/Countdown'
import StudioIntro, { hasPlayedIntro } from './components/StudioIntro'
import { submitSignup } from './lib/signup'
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
      setMessage('Your player ID is ready. Save it below.')
    } catch (error) {
      setStatus('error')
      setMessage(error instanceof Error ? error.message : 'The call failed. Try again in a moment.')
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
            <nav className="hero-nav" aria-label="Game sections">
              <a href="#waitlist">Waitlist</a>
              <a href="#story">Story</a>
              <a href="#signal">Player ID</a>
            </nav>

            <div className="hero-copy">
              <p className="section-kicker">Co-op mystery from Maxwel Game Studio</p>
              <h1 id="hero-title">Don&apos;t Hang Up</h1>
              <p className="hook">Two friends. One strange call. Stay together until the line goes quiet.</p>
            </div>

            <div className="storybook-scene" aria-hidden="true">
              <div className="sun-glow" />
              <div className="mountain mountain--left" />
              <div className="mountain mountain--right" />
              <div className="valley">
                <span />
                <span />
                <span />
              </div>
              <div className="river" />
              <div className="cliff">
                <div className="character character--boy">
                  <span className="head" />
                  <span className="body" />
                  <span className="leg leg--left" />
                  <span className="leg leg--right" />
                </div>
                <div className="character character--girl">
                  <span className="hair" />
                  <span className="head" />
                  <span className="body" />
                  <span className="leg leg--left" />
                  <span className="leg leg--right" />
                </div>
                <div className="phone-orb" />
              </div>
            </div>

            <form id="waitlist" className="signup-form" onSubmit={handleSubmit} noValidate>
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
                  {status === 'loading' ? 'Saving...' : 'Get Player ID'}
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
