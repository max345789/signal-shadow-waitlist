import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseAnonKey, getSupabaseUrl } from "./config";

/**
 * Creates or retrieves the browser-side Supabase client.
 * Uses cookies for session management with SSR support.
 */
let clientInstance: ReturnType<typeof createBrowserClient> | null = null;

export function createClient() {
  const url = getSupabaseUrl();
  const anonKey = getSupabaseAnonKey();

  if (!url || !anonKey) {
    return null;
  }

  if (typeof window !== "undefined") {
    if (!clientInstance) {
      clientInstance = createBrowserClient(url, anonKey);
    }
    return clientInstance;
  }

  return createBrowserClient(url, anonKey);
}

export function getBrowserSupabase() {
  return createClient();
}
