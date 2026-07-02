import type { SignupClient } from './waitlist'

const demoSignupEnabled = import.meta.env.VITE_DEMO_SIGNUP === 'true'

export const submitSignup: SignupClient = async (payload) => {
  if (demoSignupEnabled) {
    await new Promise((resolve) => window.setTimeout(resolve, 350))
    return {
      display_id: 'DHU-4X9K2',
      referral_code: payload.referred_by ?? 'ABC123',
      success: true,
    }
  }

  const response = await fetch('/api/waitlist', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  const data = await response.json().catch(() => null)

  if (!response.ok) {
    throw new Error(data?.error ?? 'The call failed. Try again in a moment.')
  }

  return data
}
