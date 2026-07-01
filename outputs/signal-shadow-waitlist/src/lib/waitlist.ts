const disposableDomains = new Set([
  '10minutemail.com',
  'guerrillamail.com',
  'mailinator.com',
  'tempmail.com',
  'yopmail.com',
])

export type SignupPayload = {
  email: string
  referred_by: string | null
}

export type SignupResponse = {
  display_id: string
  referral_code: string
  success: true
}

export type SignupClient = (payload: SignupPayload) => Promise<SignupResponse>

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

export function isValidEmail(email: string): boolean {
  const normalized = normalizeEmail(email)
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

  if (!emailPattern.test(normalized)) {
    return false
  }

  const domain = normalized.split('@')[1]
  return Boolean(domain && !disposableDomains.has(domain))
}

export function buildReferralUrl(origin: string, referralCode: string): string {
  const url = new URL(origin)
  url.searchParams.set('ref', referralCode)
  return url.toString()
}

export function readReferralCode(search = window.location.search): string | null {
  const ref = new URLSearchParams(search).get('ref')
  return ref && /^[A-Z0-9]{6}$/i.test(ref) ? ref.toUpperCase() : null
}
