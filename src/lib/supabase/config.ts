/**
 * Supabase Configuration & Environment Validator
 *
 * Supports both modern Next.js NEXT_PUBLIC_SUPABASE_* variables
 * and legacy VITE_SUPABASE_* variables for full backward compatibility.
 */

export interface SupabaseConfig {
  url: string;
  anonKey: string;
  serviceRoleKey?: string;
  databaseUrl?: string;
  directUrl?: string;
  storageBucket: string;
}

export function getSupabaseUrl(): string | undefined {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL
  );
}

export function getSupabaseAnonKey(): string | undefined {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY
  );
}

export function getSupabaseServiceRoleKey(): string | undefined {
  return process.env.SUPABASE_SERVICE_ROLE_KEY;
}

export function getSupabaseStorageBucket(): string {
  return process.env.SUPABASE_STORAGE_BUCKET || "deal-vault";
}

export function isSupabaseConfigured(): boolean {
  const url = getSupabaseUrl();
  const key = getSupabaseAnonKey();
  return Boolean(url && url.trim().length > 0 && key && key.trim().length > 0);
}

export function isSupabaseAdminConfigured(): boolean {
  return Boolean(isSupabaseConfigured() && getSupabaseServiceRoleKey());
}

export function getSupabaseConfig(): SupabaseConfig {
  const url = getSupabaseUrl();
  const anonKey = getSupabaseAnonKey();

  if (!url || !anonKey) {
    throw new Error(
      "Supabase is not configured. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in your environment variables."
    );
  }

  return {
    url,
    anonKey,
    serviceRoleKey: getSupabaseServiceRoleKey(),
    databaseUrl: process.env.DATABASE_URL,
    directUrl: process.env.DIRECT_URL,
    storageBucket: getSupabaseStorageBucket(),
  };
}
