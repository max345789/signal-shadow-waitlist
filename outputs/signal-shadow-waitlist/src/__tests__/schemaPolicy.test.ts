import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('waitlist schema access policy', () => {
  it('does not allow anon users to bypass the rate-limited Edge Function with direct table inserts', () => {
    const migrationsDir = join(process.cwd(), 'supabase/migrations')
    const sql = readdirSync(migrationsDir)
      .filter((file) => file.endsWith('.sql'))
      .sort()
      .map((file) => readFileSync(join(migrationsDir, file), 'utf8'))
      .join('\n')
      .toLowerCase()

    expect(sql).not.toContain('grant insert on public.users to anon')
    expect(sql).toContain('revoke insert on public.users from anon')
  })
})
