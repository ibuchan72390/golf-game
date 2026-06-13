import { describe, expect, it } from 'vitest';
import { readConfig } from './config';

const full = {
  VITE_SUPABASE_URL: 'https://x.supabase.co',
  VITE_SUPABASE_ANON_KEY: 'anon',
  VITE_OIDC_ISSUER: 'https://t.auth0.com/',
  VITE_OIDC_CLIENT_ID: 'cid',
};

describe('readConfig', () => {
  it('returns null when any required var is missing', () => {
    expect(readConfig({})).toBeNull();
    expect(readConfig({ ...full, VITE_SUPABASE_URL: undefined })).toBeNull();
    expect(readConfig({ ...full, VITE_OIDC_CLIENT_ID: '' })).toBeNull();
  });

  it('builds a config when all required vars are present', () => {
    const c = readConfig({ ...full, VITE_OIDC_AUDIENCE: 'aud', VITE_OIDC_REDIRECT_URI: 'https://app/' });
    expect(c).not.toBeNull();
    expect(c!.supabaseUrl).toBe('https://x.supabase.co');
    expect(c!.oidc.clientId).toBe('cid');
    expect(c!.oidc.audience).toBe('aud');
    expect(c!.oidc.redirectUri).toBe('https://app/');
  });
});
