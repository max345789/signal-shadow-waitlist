export type TimeParts = {
  days: number
  hours: number
  minutes: number
  seconds: number
}

export function getNovember18Target(now = new Date()): Date {
  const year = now.getUTCFullYear()
  const target = new Date(Date.UTC(year, 10, 18, 0, 0, 0, 0))

  if (now.getTime() > target.getTime()) {
    throw new Error(`November 18, ${year} has already passed`)
  }

  return target
}

export function getTimeParts(milliseconds: number): TimeParts {
  const remaining = Math.max(0, milliseconds)
  const totalSeconds = Math.floor(remaining / 1000)
  const days = Math.floor(totalSeconds / 86400)
  const hours = Math.floor((totalSeconds % 86400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  return { days, hours, minutes, seconds }
}
