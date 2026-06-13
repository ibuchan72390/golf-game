// src/net/config.ts
export interface OidcConfig {
  issuer: string;
  clientId: string;
  audience?: string;
  redirectUri: string;
}

export interface MultiplayerConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  oidc: OidcConfig;
}

type Env = Record<string, string | undefined>;

/** Returns a fully-populated config, or null if any required var is missing/empty. */
export function readConfig(env: Env): MultiplayerConfig | null {
  const supabaseUrl = env.VITE_SUPABASE_URL;
  const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY;
  const issuer = env.VITE_OIDC_ISSUER;
  const clientId = env.VITE_OIDC_CLIENT_ID;
  if (!supabaseUrl || !supabaseAnonKey || !issuer || !clientId) return null;

  const fallbackRedirect =
    typeof location !== 'undefined' ? location.origin + location.pathname : '';
  return {
    supabaseUrl,
    supabaseAnonKey,
    oidc: {
      issuer,
      clientId,
      audience: env.VITE_OIDC_AUDIENCE || undefined,
      redirectUri: env.VITE_OIDC_REDIRECT_URI || fallbackRedirect,
    },
  };
}

/** Live config read from Vite's compile-time env. Null in single-player builds. */
export const multiplayerConfig: MultiplayerConfig | null = readConfig(
  import.meta.env as unknown as Env,
);

export const isMultiplayerEnabled = (): boolean => multiplayerConfig !== null;
