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

const heroBackground =
  'linear-gradient(180deg, rgba(9, 30, 46, 0.12), rgba(7, 13, 8, 0.72)), url("/assets/dont-hang-up-mountain-hero-compact.jpg")'

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
        <main className="page-shell" style={{ backgroundImage: heroBackground }}>
          <header className="brand-ribbon">
            <a className="brand-wordmark" href="#waitlist" aria-label="Don't Hang Up home">
              DHU
            </a>
            <nav className="hero-nav" aria-label="Game sections">
              <a href="#waitlist">Waitlist</a>
              <a href="#story">Story</a>
              <a href="#signal">Player ID</a>
            </nav>
            <a className="menu-link" href="#waitlist">
              Menu
              <span aria-hidden="true" />
            </a>
          </header>

          <section className="hero" aria-labelledby="hero-title">
            <div className="hero-copy">
              <p className="section-kicker">Maxwel Game Studio waitlist</p>
              <h1 id="hero-title">
                Join Before
                <span> The Call Drops.</span>
              </h1>
              <p id="story" className="hook">
                Get your player ID for <strong>Don&apos;t Hang Up</strong>, the co-op mystery where two friends have to stay
                connected until the line goes quiet.
              </p>

              <form id="waitlist" className="signup-form" onSubmit={handleSubmit} noValidate>
                <label htmlFor="email">Email</label>
                <div className="form-row">
                  <input
                    id="email"
                    type="email"
                    value={email}
                    autoComplete="email"
                    placeholder="Your fav email here..."
                    onChange={(event) => setEmail(event.target.value)}
                    aria-invalid={status === 'error'}
                  />
                  <button type="submit" disabled={status === 'loading'}>
                    {status === 'loading' ? 'Saving...' : 'Join the Waitlist'}
                  </button>
                </div>
                {message && (
                  <p className={status === 'error' ? 'form-message form-message--error' : 'form-message'} role="status">
                    {message}
                  </p>
                )}
              </form>
            </div>

            <aside className="studio-strip" aria-label="Studio details">
              <span>Created By</span>
              <strong>Maxwel</strong>
              <strong>MGS</strong>
              <strong>Don&apos;t Hang Up</strong>
            </aside>
          </section>

          {signup && <Countdown displayId={signup.display_id} referralCode={signup.referral_code} />}
        </main>
      )}
    </>
  )
}
