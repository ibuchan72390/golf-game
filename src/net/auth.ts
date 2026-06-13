// src/net/auth.ts
import { UserManager, type UserManagerSettings } from 'oidc-client-ts';
import type { MultiplayerConfig } from './config';

export interface AuthUser {
  id: string; // OIDC `sub`
  name: string;
}

export interface AuthProvider {
  getUser(): AuthUser | null;
  login(): Promise<void>;
  logout(): Promise<void>;
  getAccessToken(): Promise<string | null>;
  /** Resolve any redirect callback on boot; returns the signed-in user if present. */
  init(): Promise<AuthUser | null>;
}

/** Used when multiplayer is disabled. Everything is a no-op. */
export class NullAuthProvider implements AuthProvider {
  getUser(): AuthUser | null { return null; }
  async login(): Promise<void> {}
  async logout(): Promise<void> {}
  async getAccessToken(): Promise<string | null> { return null; }
  async init(): Promise<AuthUser | null> { return null; }
}

/** Used by e2e/dev (`?mp=fake`) — a pre-signed-in user with a static token. */
export class TestAuthProvider implements AuthProvider {
  private user: AuthUser | null;
  private token: string | null;
  constructor(user: AuthUser, token: string) {
    this.user = user;
    this.token = token;
  }
  getUser(): AuthUser | null { return this.user; }
  async login(): Promise<void> {}
  async logout(): Promise<void> { this.user = null; this.token = null; }
  async getAccessToken(): Promise<string | null> { return this.token; }
  async init(): Promise<AuthUser | null> { return this.user; }
}

/** Real OIDC (authorization-code + PKCE). External boundary — not unit-tested. */
export class OidcAuthProvider implements AuthProvider {
  private mgr: UserManager;
  private user: AuthUser | null = null;

  constructor(cfg: MultiplayerConfig) {
    const settings: UserManagerSettings = {
      authority: cfg.oidc.issuer,
      client_id: cfg.oidc.clientId,
      redirect_uri: cfg.oidc.redirectUri,
      response_type: 'code',
      scope: 'openid profile email',
      extraQueryParams: cfg.oidc.audience ? { audience: cfg.oidc.audience } : undefined,
    };
    this.mgr = new UserManager(settings);
  }

  private toUser(u: { profile?: { sub?: string; name?: string; nickname?: string; email?: string } } | null): AuthUser | null {
    const sub = u?.profile?.sub;
    if (!sub) return null;
    const name = u?.profile?.name || u?.profile?.nickname || u?.profile?.email || sub;
    return { id: sub, name };
  }

  async init(): Promise<AuthUser | null> {
    if (location.search.includes('code=') && location.search.includes('state=')) {
      const u = await this.mgr.signinRedirectCallback();
      this.user = this.toUser(u);
      // Strip the OIDC params from the URL.
      history.replaceState({}, '', location.origin + location.pathname);
    } else {
      this.user = this.toUser(await this.mgr.getUser());
    }
    return this.user;
  }

  getUser(): AuthUser | null { return this.user; }

  async login(): Promise<void> {
    await this.mgr.signinRedirect();
  }

  async logout(): Promise<void> {
    await this.mgr.removeUser();
    this.user = null;
  }

  async getAccessToken(): Promise<string | null> {
    const u = await this.mgr.getUser();
    return u?.access_token ?? null;
  }
}

export interface AuthOptions {
  fakeUser?: AuthUser;
  fakeToken?: string;
}

export function createAuthProvider(
  config: MultiplayerConfig | null,
  opts: AuthOptions,
): AuthProvider {
  if (opts.fakeUser) return new TestAuthProvider(opts.fakeUser, opts.fakeToken ?? 'fake-token');
  if (config) return new OidcAuthProvider(config);
  return new NullAuthProvider();
}
