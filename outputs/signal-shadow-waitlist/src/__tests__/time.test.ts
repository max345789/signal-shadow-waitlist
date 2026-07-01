import { describe, expect, it } from 'vitest'
import { getNovember18Target, getTimeParts } from '../lib/time'

describe('countdown target', () => {
  it('targets November 18 of the current year before release day', () => {
    const target = getNovember18Target(new Date('2026-07-01T09:00:00Z'))

    expect(target.toISOString()).toBe('2026-11-18T00:00:00.000Z')
  })

  it('throws instead of silently rolling over after November 18 has passed', () => {
    expect(() => getNovember18Target(new Date('2026-11-19T00:00:00Z'))).toThrow(/passed/i)
  })
})

describe('countdown parts', () => {
  it('breaks milliseconds into days, hours, minutes, and seconds', () => {
    const parts = getTimeParts(2 * 86400_000 + 3 * 3600_000 + 4 * 60_000 + 5_000)

    expect(parts).toEqual({ days: 2, hours: 3, minutes: 4, seconds: 5 })
  })
})
