import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
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
  'linear-gradient(180deg, rgba(9, 30, 46, 0.12), rgba(7, 13, 8, 0.72)), url("/assets/dont-hang-up-mountain-hero.jpg")'

function MgsApp({ forceIntroComplete = false, signupClient = submitSignup }: AppProps) {
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
            <a className="brand-wordmark" href="/" aria-label="Brandlift Creations home">
              DHU
            </a>
            <nav className="hero-nav" aria-label="Game sections">
              <a href="#waitlist">Waitlist</a>
              <a href="#story">Story</a>
              <a href="#signal">Player ID</a>
              <a href="/">Brandlift</a>
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

function BrandliftHub() {
  const [splashVisible, setSplashVisible] = useState(true)
  const [splashLeaving, setSplashLeaving] = useState(false)

  useEffect(() => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const leave = window.setTimeout(() => setSplashLeaving(true), reducedMotion ? 350 : 1900)
    const remove = window.setTimeout(() => setSplashVisible(false), reducedMotion ? 500 : 2550)
    return () => {
      window.clearTimeout(leave)
      window.clearTimeout(remove)
    }
  }, [])

  return (
    <main className="brandlift-hub">
      {splashVisible && (
        <section className={`brandlift-splash${splashLeaving ? ' brandlift-splash--leaving' : ''}`} role="status" aria-label="Loading Brandlift Creations">
          <div className="brandlift-splash__grid" />
          <div className="brandlift-splash__center">
            <div className="brandlift-monogram"><span>B</span><span>L</span></div>
            <strong>Brandlift Creations</strong>
            <i><b /></i>
          </div>
          <footer><span>CREATIVE TECHNOLOGY</span><span>INDIA · 2026</span></footer>
        </section>
      )}

      <header className="brandlift-nav">
        <a href="/" className="brandlift-logo"><span>BL</span><strong>Brandlift<br />Creations</strong></a>
        <nav aria-label="Brandlift brands"><a href="#brands">Our brands</a><span>Independent products,<br />one creative house.</span></nav>
      </header>
      <section className="brandlift-hero">
        <p>00 / BRAND HOUSE</p>
        <h1>We create<br /><em>worlds</em> worth<br />entering.</h1>
        <div><p>Brandlift Creations is the home of independent products shaped by technology, craft, and a point of view.</p><span>SCROLL TO EXPLORE<br />↓</span></div>
      </section>
      <section className="brandlift-manifesto"><span>ONE HOUSE. DISTINCT VISIONS.</span><p>From immersive digital worlds to native AI tools, every Brandlift creation begins with the same idea:</p><h2>Technology should feel<br /><em>less like machinery</em><br />and more like possibility.</h2></section>
      <section className="brandlift-brands" id="brands"><header><span>01 / OUR BRANDS</span><h2>Choose a world.</h2></header><div>
        <a className="brandlift-card brandlift-card--mgs" href="/mgs"><span>01</span><b>↗</b><i>M</i><div><small>Interactive worlds</small><h3>MGS</h3><p>Original games and real-time experiences built to make imagined worlds feel tangible.</p><strong>Enter MGS →</strong></div></a>
        <a className="brandlift-card brandlift-card--alto" href="https://alto-space-macos.iitsmesarath.chatgpt.site"><span>02</span><b>↗</b><i>A</i><div><small>Native intelligence</small><h3>Alto Space</h3><p>A focused, private AI workspace that brings powerful models to the Mac desktop.</p><strong>Enter Alto Space →</strong></div></a>
      </div></section>
      <footer className="brandlift-footer"><a href="/" className="brandlift-logo"><span>BL</span><strong>Brandlift<br />Creations</strong></a><p>Creative technology. Distinctly human.</p><nav><a href="/mgs">MGS</a><a href="https://alto-space-macos.iitsmesarath.chatgpt.site">Alto Space</a></nav><small>© 2026 Brandlift Creations</small></footer>
    </main>
  )
}

export default function App(props: AppProps) {
  if (props.forceIntroComplete || window.location.pathname.startsWith('/mgs')) {
    return <MgsApp {...props} />
  }
  return <BrandliftHub />
}
