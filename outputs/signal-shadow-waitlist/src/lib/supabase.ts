import { createClient } from '@supabase/supabase-js'
import type { SignupClient } from './waitlist'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
const demoSignupEnabled = import.meta.env.VITE_DEMO_SIGNUP === 'true'

export const submitSignup: SignupClient = async (payload) => {
  if (demoSignupEnabled) {
    await new Promise((resolve) => window.setTimeout(resolve, 350))
    return {
      display_id: 'SW-4X9K2',
      referral_code: payload.referred_by ?? 'ABC123',
      success: true,
    }
  }

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.')
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey)
  const { data, error } = await supabase.functions.invoke('waitlist-signup', {
    body: payload,
  })

  if (error) {
    throw error
  }

  return data
}
