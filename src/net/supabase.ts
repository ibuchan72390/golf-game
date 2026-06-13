// src/net/supabase.ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { MultiplayerConfig } from './config';
import type { AuthProvider } from './auth';

/**
 * Supabase client wired to the OIDC token via the third-party-auth `accessToken`
 * callback, so every request carries the provider's JWT and RLS keys off `sub`.
 */
export function createSupabaseClient(
  cfg: MultiplayerConfig,
  auth: AuthProvider,
): SupabaseClient {
  return createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
    accessToken: async () => (await auth.getAccessToken()) ?? '',
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
