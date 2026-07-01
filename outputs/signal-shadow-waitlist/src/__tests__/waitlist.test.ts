import { describe, expect, it } from 'vitest'
import {
  buildReferralUrl,
  isValidEmail,
  normalizeEmail,
} from '../lib/waitlist'

describe('waitlist helpers', () => {
  it('normalizes and validates ordinary email addresses', () => {
    expect(normalizeEmail('  Player@Example.COM ')).toBe('player@example.com')
    expect(isValidEmail('player@example.com')).toBe(true)
  })

  it('rejects malformed and disposable-looking addresses', () => {
    expect(isValidEmail('not-an-email')).toBe(false)
    expect(isValidEmail('player@mailinator.com')).toBe(false)
  })

  it('builds referral links with the ref query parameter', () => {
    expect(buildReferralUrl('https://signal-shadow.example/', 'ABC123')).toBe(
      'https://signal-shadow.example/?ref=ABC123',
    )
  })
})
