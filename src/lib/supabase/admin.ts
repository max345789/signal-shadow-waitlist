import { createClient } from "@supabase/supabase-js";
import { getSupabaseServiceRoleKey, getSupabaseUrl } from "./config";

/**
 * Creates a privileged Supabase admin client using the service role key.
 * Used only on the server for admin tasks, bypassing RLS, and secure bucket provisioning.
 */
let adminInstance: ReturnType<typeof createClient> | null = null;

export function getAdminSupabaseClient() {
  const url = getSupabaseUrl();
  const serviceRoleKey = getSupabaseServiceRoleKey();

  if (!url || !serviceRoleKey) {
    return null;
  }

  if (!adminInstance) {
    adminInstance = createClient(url, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }

  return adminInstance;
}
