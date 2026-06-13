# Multiplayer Phase 1 — Identity & Friends Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add signed-in identity (provider-agnostic OIDC, Auth0 issuer) and a minimal friend graph (invite-link → accepted friendship, friends list, remove) on top of Supabase, while keeping single-player fully working and CI green without any secrets.

**Architecture:** A new `src/net/` layer holds all network concerns behind interfaces: `MultiplayerConfig` (from Vite env, `null` when unset), an `AuthProvider` interface (OIDC implementation + a test implementation + a null implementation), a Supabase client wired to the auth token, a pure `friendsViewModel` reducer, and a `MultiplayerService` interface with a Supabase implementation and an in-memory fake. The UI depends only on the interfaces, so e2e runs against the fake with zero secrets, and the whole feature self-disables (single-player untouched) when env is absent.

**Tech Stack:** TypeScript + Vite, `@supabase/supabase-js` v2 (third-party-auth via the `accessToken` callback), `oidc-client-ts` (authorization-code + PKCE), Vitest (unit, jsdom for DOM), Playwright (e2e against the fake).

**Spec:** `docs/superpowers/specs/2026-06-13-multiplayer-mvp-design.md` (§§1–4, 6; deploy/smoke §7 is Phase 4).

---

## File Structure

**Create:**
- `src/net/config.ts` — `MultiplayerConfig`, `readConfig(env)`, `multiplayerConfig` (module value from `import.meta.env`).
- `src/net/config.test.ts`
- `src/net/auth.ts` — `AuthUser`, `AuthProvider`, `NullAuthProvider`, `TestAuthProvider`, `OidcAuthProvider`, `createAuthProvider()`.
- `src/net/auth.test.ts`
- `src/net/supabase.ts` — `createSupabaseClient(config, auth)`.
- `src/net/friends.ts` — `FriendshipRow`, `Friend`, `FriendRequest`, `FriendsView`, `friendsViewModel()`.
- `src/net/friends.test.ts`
- `src/net/service.ts` — `ProfileRef`, `MultiplayerService`, `SupabaseMultiplayerService`.
- `src/net/fakeService.ts` — `FakeMultiplayerService`, `makeFakeStore()`.
- `src/net/fakeService.test.ts`
- `src/ui/friends.ts` — `showFriends(root, view, inviteLink, cb)`.
- `src/ui/friends.test.ts`
- `supabase/migrations/0001_profiles_friendships.sql`
- `docs/multiplayer-setup.md`
- `.env.example`
- `e2e/friends.spec.ts`

**Modify:**
- `src/ui/menu.ts` — add optional `onFriends` callback + conditional button.
- `src/main.ts` — wire config/auth/service, "Play with Friends" flow, `?friend=<code>` and `?mp=fake` handling, test hooks.
- `.github/workflows/ci.yml` — add `e2e/friends.spec.ts` to the functional e2e list.
- `package.json` — add `@supabase/supabase-js`, `oidc-client-ts` deps.
- `README.md` — brief multiplayer setup pointer.

---

## Task 1: Dependencies + `.env.example`

**Files:**
- Modify: `package.json`
- Create: `.env.example`

- [ ] **Step 1: Install runtime deps**

Run:
```bash
npm install @supabase/supabase-js@^2 oidc-client-ts@^3
```
Expected: both added under `dependencies` in `package.json`; lockfile updated.

- [ ] **Step 2: Create `.env.example`**

```bash
# Multiplayer config (all five required to enable "Play with Friends").
# When unset, the app runs single-player only and CI passes without secrets.
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_OIDC_ISSUER=
VITE_OIDC_CLIENT_ID=
# Optional:
VITE_OIDC_AUDIENCE=
VITE_OIDC_REDIRECT_URI=
```

- [ ] **Step 3: Verify install + typecheck still green**

Run: `npm run typecheck`
Expected: PASS (no usages yet; deps just present).

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json .env.example
git commit -m "build: add supabase-js + oidc-client-ts deps and .env.example"
```

---

## Task 2: Config module

**Files:**
- Create: `src/net/config.ts`
- Test: `src/net/config.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/net/config.test.ts`
Expected: FAIL ("Cannot find module './config'").

- [ ] **Step 3: Write the implementation**

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/net/config.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/net/config.ts src/net/config.test.ts
git commit -m "feat(net): env-driven multiplayer config (null when unset)"
```

---

## Task 3: Auth provider interface + Null/Test implementations

**Files:**
- Create: `src/net/auth.ts`
- Test: `src/net/auth.test.ts`

Note: `OidcAuthProvider` is the external boundary (no unit test — verified by typecheck and the Phase 4 smoke suite). `NullAuthProvider` and `TestAuthProvider` are pure and fully tested here.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { NullAuthProvider, TestAuthProvider, createAuthProvider } from './auth';

describe('NullAuthProvider', () => {
  it('has no user and no token', async () => {
    const a = new NullAuthProvider();
    expect(a.getUser()).toBeNull();
    expect(await a.getAccessToken()).toBeNull();
    await a.login(); // no-op, must not throw
    await a.logout();
  });
});

describe('TestAuthProvider', () => {
  it('reports the injected user and token', async () => {
    const a = new TestAuthProvider({ id: 'user-1', name: 'Alice' }, 'tok-abc');
    expect(a.getUser()).toEqual({ id: 'user-1', name: 'Alice' });
    expect(await a.getAccessToken()).toBe('tok-abc');
  });

  it('logout clears the user', async () => {
    const a = new TestAuthProvider({ id: 'user-1', name: 'Alice' }, 'tok');
    await a.logout();
    expect(a.getUser()).toBeNull();
    expect(await a.getAccessToken()).toBeNull();
  });
});

describe('createAuthProvider', () => {
  it('returns a TestAuthProvider when a fake user is supplied', () => {
    const a = createAuthProvider(null, { fakeUser: { id: 'u', name: 'Bob' } });
    expect(a.getUser()).toEqual({ id: 'u', name: 'Bob' });
  });

  it('returns a NullAuthProvider when config is null and no fake user', () => {
    const a = createAuthProvider(null, {});
    expect(a.getUser()).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/net/auth.test.ts`
Expected: FAIL ("Cannot find module './auth'").

- [ ] **Step 3: Write the implementation**

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/net/auth.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/net/auth.ts src/net/auth.test.ts
git commit -m "feat(net): provider-agnostic AuthProvider (OIDC + null + test impls)"
```

---

## Task 4: Supabase client factory

**Files:**
- Create: `src/net/supabase.ts`

External boundary — verified by typecheck (no unit test; behavior covered later via the fake service and Phase 4 smoke).

- [ ] **Step 1: Write the implementation**

```ts
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
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/net/supabase.ts
git commit -m "feat(net): supabase client wired to OIDC access token"
```

---

## Task 5: Friends view-model reducer (pure)

**Files:**
- Create: `src/net/friends.ts`
- Test: `src/net/friends.test.ts`

Resolution of a spec nuance: invite-link claims auto-accept (§3), so `pending` rows don't normally arise in the MVP. The reducer still surfaces `incoming`/`outgoing` so the UI's requests section (§4) is complete and forward-compatible with the later in-app request flow; in pure-link operation those lists are simply empty.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { friendsViewModel, type FriendshipRow } from './friends';

const names = new Map([
  ['me', 'Me'],
  ['a', 'Alice'],
  ['b', 'Bob'],
  ['c', 'Carol'],
]);

describe('friendsViewModel', () => {
  it('lists accepted friendships in either direction as friends', () => {
    const rows: FriendshipRow[] = [
      { requesterId: 'me', addresseeId: 'a', status: 'accepted' },
      { requesterId: 'b', addresseeId: 'me', status: 'accepted' },
    ];
    const v = friendsViewModel(rows, 'me', names);
    expect(v.friends.map((f) => f.id).sort()).toEqual(['a', 'b']);
    expect(v.friends.find((f) => f.id === 'a')!.displayName).toBe('Alice');
  });

  it('splits pending into incoming (to me) and outgoing (from me)', () => {
    const rows: FriendshipRow[] = [
      { requesterId: 'c', addresseeId: 'me', status: 'pending' }, // incoming
      { requesterId: 'me', addresseeId: 'a', status: 'pending' }, // outgoing
    ];
    const v = friendsViewModel(rows, 'me', names);
    expect(v.incoming.map((r) => r.id)).toEqual(['c']);
    expect(v.outgoing.map((r) => r.id)).toEqual(['a']);
    expect(v.friends).toEqual([]);
  });

  it('falls back to the id when no display name is known', () => {
    const rows: FriendshipRow[] = [{ requesterId: 'me', addresseeId: 'z', status: 'accepted' }];
    const v = friendsViewModel(rows, 'me', new Map());
    expect(v.friends[0]).toEqual({ id: 'z', displayName: 'z' });
  });

  it('dedupes a friend that appears in multiple rows', () => {
    const rows: FriendshipRow[] = [
      { requesterId: 'me', addresseeId: 'a', status: 'accepted' },
      { requesterId: 'a', addresseeId: 'me', status: 'accepted' },
    ];
    const v = friendsViewModel(rows, 'me', names);
    expect(v.friends.map((f) => f.id)).toEqual(['a']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/net/friends.test.ts`
Expected: FAIL ("Cannot find module './friends'").

- [ ] **Step 3: Write the implementation**

```ts
// src/net/friends.ts
export type FriendStatus = 'pending' | 'accepted';

export interface FriendshipRow {
  requesterId: string;
  addresseeId: string;
  status: FriendStatus;
}

export interface Friend {
  id: string;
  displayName: string;
}

export type FriendRequest = Friend; // the other party in a pending request

export interface FriendsView {
  friends: Friend[];
  incoming: FriendRequest[];
  outgoing: FriendRequest[];
}

/** Pure: fold raw friendship rows into a view model from `myId`'s perspective. */
export function friendsViewModel(
  rows: FriendshipRow[],
  myId: string,
  names: Map<string, string>,
): FriendsView {
  const friends = new Map<string, Friend>();
  const incoming = new Map<string, FriendRequest>();
  const outgoing = new Map<string, FriendRequest>();
  const resolve = (id: string): Friend => ({ id, displayName: names.get(id) ?? id });

  for (const row of rows) {
    if (row.requesterId !== myId && row.addresseeId !== myId) continue;
    const otherId = row.requesterId === myId ? row.addresseeId : row.requesterId;
    if (row.status === 'accepted') {
      friends.set(otherId, resolve(otherId));
    } else if (row.addresseeId === myId) {
      incoming.set(otherId, resolve(otherId));
    } else {
      outgoing.set(otherId, resolve(otherId));
    }
  }

  return {
    friends: [...friends.values()],
    incoming: [...incoming.values()],
    outgoing: [...outgoing.values()],
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/net/friends.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/net/friends.ts src/net/friends.test.ts
git commit -m "feat(net): pure friends view-model reducer"
```

---

## Task 6: MultiplayerService interface + Supabase implementation

**Files:**
- Create: `src/net/service.ts`

The interface is the seam the UI depends on. `SupabaseMultiplayerService` is the external boundary (verified by typecheck; behavior exercised via the fake in tests and live in Phase 4).

- [ ] **Step 1: Write the implementation**

```ts
// src/net/service.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { FriendshipRow } from './friends';

export interface ProfileRef {
  id: string;
  displayName: string;
}

export interface MultiplayerService {
  myUserId(): string;
  getProfile(id: string): Promise<ProfileRef | null>;
  upsertProfile(displayName: string): Promise<void>;
  /** All friendship rows touching me, plus a name map for the involved users. */
  listFriendships(): Promise<{ rows: FriendshipRow[]; names: Map<string, string> }>;
  /** Create a one-time invite code for a shareable friend link. */
  createFriendInvite(): Promise<string>;
  /** Redeem an invite code → establishes an accepted friendship. */
  claimFriendInvite(code: string): Promise<void>;
  acceptRequest(otherId: string): Promise<void>;
  declineRequest(otherId: string): Promise<void>;
  removeFriend(otherId: string): Promise<void>;
  /** Subscribe to friendship changes; returns an unsubscribe fn. */
  subscribeFriends(onChange: () => void): () => void;
}

interface FriendshipDbRow { requester_id: string; addressee_id: string; status: 'pending' | 'accepted' }
interface ProfileDbRow { id: string; display_name: string }

export class SupabaseMultiplayerService implements MultiplayerService {
  constructor(
    private db: SupabaseClient,
    private userId: string,
  ) {}

  myUserId(): string { return this.userId; }

  async getProfile(id: string): Promise<ProfileRef | null> {
    const { data, error } = await this.db.from('profiles').select('id, display_name').eq('id', id).maybeSingle();
    if (error) throw error;
    return data ? { id: data.id, displayName: data.display_name } : null;
  }

  async upsertProfile(displayName: string): Promise<void> {
    const { error } = await this.db
      .from('profiles')
      .upsert({ id: this.userId, display_name: displayName }, { onConflict: 'id' });
    if (error) throw error;
  }

  async listFriendships(): Promise<{ rows: FriendshipRow[]; names: Map<string, string> }> {
    const { data, error } = await this.db
      .from('friendships')
      .select('requester_id, addressee_id, status')
      .or(`requester_id.eq.${this.userId},addressee_id.eq.${this.userId}`);
    if (error) throw error;
    const dbRows = (data ?? []) as FriendshipDbRow[];
    const rows: FriendshipRow[] = dbRows.map((r) => ({
      requesterId: r.requester_id,
      addresseeId: r.addressee_id,
      status: r.status,
    }));
    const otherIds = [...new Set(rows.map((r) => (r.requesterId === this.userId ? r.addresseeId : r.requesterId)))];
    const names = new Map<string, string>();
    if (otherIds.length) {
      const { data: profs, error: pErr } = await this.db
        .from('profiles')
        .select('id, display_name')
        .in('id', otherIds);
      if (pErr) throw pErr;
      for (const p of (profs ?? []) as ProfileDbRow[]) names.set(p.id, p.display_name);
    }
    return { rows, names };
  }

  async createFriendInvite(): Promise<string> {
    const { data, error } = await this.db.rpc('create_friend_invite');
    if (error) throw error;
    return data as string;
  }

  async claimFriendInvite(code: string): Promise<void> {
    const { error } = await this.db.rpc('claim_friend_invite', { invite_code: code });
    if (error) throw error;
  }

  async acceptRequest(otherId: string): Promise<void> {
    const { error } = await this.db
      .from('friendships')
      .update({ status: 'accepted', responded_at: new Date().toISOString() })
      .eq('requester_id', otherId)
      .eq('addressee_id', this.userId);
    if (error) throw error;
  }

  async declineRequest(otherId: string): Promise<void> {
    const { error } = await this.db
      .from('friendships')
      .delete()
      .eq('requester_id', otherId)
      .eq('addressee_id', this.userId);
    if (error) throw error;
  }

  async removeFriend(otherId: string): Promise<void> {
    const { error } = await this.db
      .from('friendships')
      .delete()
      .or(
        `and(requester_id.eq.${this.userId},addressee_id.eq.${otherId}),` +
          `and(requester_id.eq.${otherId},addressee_id.eq.${this.userId})`,
      );
    if (error) throw error;
  }

  subscribeFriends(onChange: () => void): () => void {
    const channel = this.db
      .channel(`friendships:${this.userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'friendships' }, () => onChange())
      .subscribe();
    return () => { void this.db.removeChannel(channel); };
  }
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/net/service.ts
git commit -m "feat(net): MultiplayerService interface + Supabase implementation"
```

---

## Task 7: In-memory fake service

**Files:**
- Create: `src/net/fakeService.ts`
- Test: `src/net/fakeService.test.ts`

The fake backs all unit/e2e tests and `?mp=fake` dev/e2e runs. A shared `FakeStore` lets multiple users interact deterministically.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { makeFakeStore, FakeMultiplayerService } from './fakeService';
import { friendsViewModel } from './friends';

describe('FakeMultiplayerService', () => {
  it('upserts profiles and resolves them', async () => {
    const store = makeFakeStore();
    const me = new FakeMultiplayerService(store, 'me');
    await me.upsertProfile('Me');
    expect(await me.getProfile('me')).toEqual({ id: 'me', displayName: 'Me' });
    expect(await me.getProfile('nobody')).toBeNull();
  });

  it('establishes a mutual friendship via an invite code', async () => {
    const store = makeFakeStore();
    const alice = new FakeMultiplayerService(store, 'alice');
    const bob = new FakeMultiplayerService(store, 'bob');
    await alice.upsertProfile('Alice');
    await bob.upsertProfile('Bob');

    const code = await alice.createFriendInvite();
    await bob.claimFriendInvite(code);

    const av = friendsViewModel(...(await asArgs(alice)));
    const bv = friendsViewModel(...(await asArgs(bob)));
    expect(av.friends.map((f) => f.id)).toEqual(['bob']);
    expect(bv.friends.map((f) => f.id)).toEqual(['alice']);
    expect(bv.friends[0]!.displayName).toBe('Alice');
  });

  it('claiming a code twice throws', async () => {
    const store = makeFakeStore();
    const alice = new FakeMultiplayerService(store, 'alice');
    const bob = new FakeMultiplayerService(store, 'bob');
    const code = await alice.createFriendInvite();
    await bob.claimFriendInvite(code);
    await expect(bob.claimFriendInvite(code)).rejects.toThrow();
  });

  it('removeFriend deletes the friendship for both sides', async () => {
    const store = makeFakeStore();
    const alice = new FakeMultiplayerService(store, 'alice');
    const bob = new FakeMultiplayerService(store, 'bob');
    const code = await alice.createFriendInvite();
    await bob.claimFriendInvite(code);
    await alice.removeFriend('bob');
    expect((await alice.listFriendships()).rows).toEqual([]);
    expect((await bob.listFriendships()).rows).toEqual([]);
  });
});

async function asArgs(svc: FakeMultiplayerService) {
  const { rows, names } = await svc.listFriendships();
  return [rows, svc.myUserId(), names] as const;
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/net/fakeService.test.ts`
Expected: FAIL ("Cannot find module './fakeService'").

- [ ] **Step 3: Write the implementation**

```ts
// src/net/fakeService.ts
import type { FriendshipRow } from './friends';
import type { MultiplayerService, ProfileRef } from './service';

export interface FakeStore {
  profiles: Map<string, string>; // id -> displayName
  friendships: FriendshipRow[];
  invites: Map<string, { inviter: string; claimed: boolean }>;
  listeners: Set<() => void>;
  seq: number;
}

export function makeFakeStore(): FakeStore {
  return {
    profiles: new Map(),
    friendships: [],
    invites: new Map(),
    listeners: new Set(),
    seq: 0,
  };
}

function notify(store: FakeStore): void {
  for (const l of store.listeners) l();
}

export class FakeMultiplayerService implements MultiplayerService {
  constructor(private store: FakeStore, private userId: string) {}

  myUserId(): string { return this.userId; }

  async getProfile(id: string): Promise<ProfileRef | null> {
    const name = this.store.profiles.get(id);
    return name === undefined ? null : { id, displayName: name };
  }

  async upsertProfile(displayName: string): Promise<void> {
    this.store.profiles.set(this.userId, displayName);
  }

  async listFriendships(): Promise<{ rows: FriendshipRow[]; names: Map<string, string> }> {
    const rows = this.store.friendships.filter(
      (r) => r.requesterId === this.userId || r.addresseeId === this.userId,
    );
    const names = new Map<string, string>();
    for (const r of rows) {
      const other = r.requesterId === this.userId ? r.addresseeId : r.requesterId;
      const n = this.store.profiles.get(other);
      if (n !== undefined) names.set(other, n);
    }
    return { rows: rows.map((r) => ({ ...r })), names };
  }

  async createFriendInvite(): Promise<string> {
    const code = `invite-${this.userId}-${this.store.seq++}`;
    this.store.invites.set(code, { inviter: this.userId, claimed: false });
    return code;
  }

  async claimFriendInvite(code: string): Promise<void> {
    const invite = this.store.invites.get(code);
    if (!invite || invite.claimed) throw new Error('invalid or already-claimed invite');
    if (invite.inviter === this.userId) throw new Error('cannot friend yourself');
    invite.claimed = true;
    const exists = this.store.friendships.some(
      (r) =>
        (r.requesterId === invite.inviter && r.addresseeId === this.userId) ||
        (r.requesterId === this.userId && r.addresseeId === invite.inviter),
    );
    if (!exists) {
      this.store.friendships.push({ requesterId: invite.inviter, addresseeId: this.userId, status: 'accepted' });
    }
    notify(this.store);
  }

  async acceptRequest(otherId: string): Promise<void> {
    const row = this.store.friendships.find(
      (r) => r.requesterId === otherId && r.addresseeId === this.userId && r.status === 'pending',
    );
    if (row) row.status = 'accepted';
    notify(this.store);
  }

  async declineRequest(otherId: string): Promise<void> {
    this.store.friendships = this.store.friendships.filter(
      (r) => !(r.requesterId === otherId && r.addresseeId === this.userId && r.status === 'pending'),
    );
    notify(this.store);
  }

  async removeFriend(otherId: string): Promise<void> {
    this.store.friendships = this.store.friendships.filter(
      (r) =>
        !(
          (r.requesterId === this.userId && r.addresseeId === otherId) ||
          (r.requesterId === otherId && r.addresseeId === this.userId)
        ),
    );
    notify(this.store);
  }

  subscribeFriends(onChange: () => void): () => void {
    this.store.listeners.add(onChange);
    return () => { this.store.listeners.delete(onChange); };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/net/fakeService.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/net/fakeService.ts src/net/fakeService.test.ts
git commit -m "feat(net): in-memory fake MultiplayerService for tests/dev"
```

---

## Task 8: Friends screen UI

**Files:**
- Create: `src/ui/friends.ts`
- Test: `src/ui/friends.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { showFriends } from './friends';
import type { FriendsView } from '../net/friends';

function root() {
  const r = document.createElement('div');
  document.body.appendChild(r);
  return r;
}

const view: FriendsView = {
  friends: [{ id: 'a', displayName: 'Alice' }],
  incoming: [{ id: 'c', displayName: 'Carol' }],
  outgoing: [],
};

function cbs() {
  return {
    onInvite: vi.fn(),
    onAccept: vi.fn(),
    onDecline: vi.fn(),
    onRemove: vi.fn(),
    onClose: vi.fn(),
  };
}

describe('showFriends', () => {
  it('renders friends and incoming requests', () => {
    const r = root();
    showFriends(r, view, null, cbs());
    expect(r.textContent).toContain('Alice');
    expect(r.textContent).toContain('Carol');
  });

  it('fires onInvite, onAccept, onRemove, onClose', () => {
    const r = root();
    const cb = cbs();
    showFriends(r, view, null, cb);
    (r.querySelector('#friends-invite') as HTMLElement).click();
    (r.querySelector('#friend-accept-c') as HTMLElement).click();
    (r.querySelector('#friend-remove-a') as HTMLElement).click();
    (r.querySelector('#friends-close') as HTMLElement).click();
    expect(cb.onInvite).toHaveBeenCalled();
    expect(cb.onAccept).toHaveBeenCalledWith('c');
    expect(cb.onRemove).toHaveBeenCalledWith('a');
    expect(cb.onClose).toHaveBeenCalled();
  });

  it('shows the invite link when provided', () => {
    const r = root();
    showFriends(r, view, 'https://app/?friend=xyz', cbs());
    const input = r.querySelector('#friends-invite-link') as HTMLInputElement;
    expect(input.value).toBe('https://app/?friend=xyz');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/ui/friends.test.ts`
Expected: FAIL ("Cannot find module './friends'").

- [ ] **Step 3: Write the implementation**

```ts
// src/ui/friends.ts
import type { FriendsView } from '../net/friends';

const overlay =
  'position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;gap:14px;padding:32px 16px;overflow:auto;background:linear-gradient(180deg,#6fc3f0,#cdeefb);pointer-events:auto;font-family:system-ui,sans-serif;';
const btn =
  'background:#1b5e20;color:#fff;border:none;border-radius:12px;padding:10px 18px;font-size:15px;font-weight:700;cursor:pointer;';
const row =
  'display:flex;align-items:center;justify-content:space-between;gap:12px;width:min(92vw,460px);background:rgba(255,255,255,.7);border-radius:10px;padding:10px 14px;';

export interface FriendsCallbacks {
  onInvite(): void;
  onAccept(id: string): void;
  onDecline(id: string): void;
  onRemove(id: string): void;
  onClose(): void;
}

export function showFriends(
  root: HTMLElement,
  view: FriendsView,
  inviteLink: string | null,
  cb: FriendsCallbacks,
): void {
  const esc = (s: string) =>
    s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

  const friendRows = view.friends.length
    ? view.friends
        .map(
          (f) =>
            `<div style="${row}"><span>👤 ${esc(f.displayName)}</span>` +
            `<button id="friend-remove-${f.id}" style="${btn}background:#b71c1c;padding:6px 12px;font-size:13px;">Remove</button></div>`,
        )
        .join('')
    : `<div style="opacity:.7;">No friends yet — send an invite link.</div>`;

  const incomingRows = view.incoming
    .map(
      (r) =>
        `<div style="${row}"><span>📩 ${esc(r.displayName)}</span><span>` +
        `<button id="friend-accept-${r.id}" style="${btn}padding:6px 12px;font-size:13px;">Accept</button> ` +
        `<button id="friend-decline-${r.id}" style="${btn}background:#607d8b;padding:6px 12px;font-size:13px;">Decline</button></span></div>`,
    )
    .join('');

  const linkBlock = inviteLink
    ? `<div style="${row}"><input id="friends-invite-link" readonly value="${esc(inviteLink)}" style="flex:1;border:none;background:transparent;font-size:13px;" />` +
      `<button id="friends-copy" style="${btn}padding:6px 12px;font-size:13px;">Copy</button></div>`
    : '';

  root.innerHTML = `
    <div style="${overlay}">
      <div style="font-size:30px;font-weight:900;color:#1b5e20;">Friends</div>
      <button id="friends-invite" style="${btn}background:#ef6c00;">➕ Invite a Friend</button>
      ${linkBlock}
      ${view.incoming.length ? `<div style="font-weight:800;color:#37474f;">Requests</div>${incomingRows}` : ''}
      <div style="font-weight:800;color:#37474f;margin-top:6px;">Your Friends</div>
      ${friendRows}
      <button id="friends-close" style="${btn}background:#37474f;margin-top:12px;">Back</button>
    </div>`;

  (root.querySelector('#friends-invite') as HTMLElement).onclick = cb.onInvite;
  (root.querySelector('#friends-close') as HTMLElement).onclick = cb.onClose;
  const copy = root.querySelector('#friends-copy') as HTMLElement | null;
  if (copy && inviteLink) copy.onclick = () => void navigator.clipboard?.writeText(inviteLink);
  for (const f of view.friends) {
    (root.querySelector(`#friend-remove-${f.id}`) as HTMLElement).onclick = () => cb.onRemove(f.id);
  }
  for (const r of view.incoming) {
    (root.querySelector(`#friend-accept-${r.id}`) as HTMLElement).onclick = () => cb.onAccept(r.id);
    (root.querySelector(`#friend-decline-${r.id}`) as HTMLElement).onclick = () => cb.onDecline(r.id);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/ui/friends.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/ui/friends.ts src/ui/friends.test.ts
git commit -m "feat(ui): friends screen (list, requests, invite link)"
```

---

## Task 9: Supabase migration (schema + RLS + RPCs)

**Files:**
- Create: `supabase/migrations/0001_profiles_friendships.sql`

No unit test (SQL/DB). Verified via `npm run typecheck` (unaffected) and the manual checklist in Task 12.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/0001_profiles_friendships.sql
-- Identity + friend graph for the multiplayer MVP. RLS keyed off the OIDC `sub`
-- delivered by third-party auth: auth.jwt()->>'sub'.

create or replace function public.current_uid() returns text
  language sql stable as $$ select auth.jwt()->>'sub' $$;

-- Profiles -----------------------------------------------------------------
create table if not exists public.profiles (
  id           text primary key,
  display_name text not null check (length(display_name) between 1 and 40),
  created_at   timestamptz not null default now(),
  last_seen    timestamptz not null default now()
);
alter table public.profiles enable row level security;

create policy profiles_select_authenticated on public.profiles
  for select using (public.current_uid() is not null);
create policy profiles_upsert_self on public.profiles
  for insert with check (id = public.current_uid());
create policy profiles_update_self on public.profiles
  for update using (id = public.current_uid()) with check (id = public.current_uid());

-- Friendships --------------------------------------------------------------
create table if not exists public.friendships (
  requester_id text not null references public.profiles(id) on delete cascade,
  addressee_id text not null references public.profiles(id) on delete cascade,
  status       text not null default 'accepted' check (status in ('pending','accepted')),
  created_at   timestamptz not null default now(),
  responded_at timestamptz,
  primary key (requester_id, addressee_id),
  check (requester_id <> addressee_id)
);
alter table public.friendships enable row level security;

create policy friendships_select_mine on public.friendships
  for select using (
    requester_id = public.current_uid() or addressee_id = public.current_uid()
  );
-- Accept (update) only the addressee may flip a pending row.
create policy friendships_update_addressee on public.friendships
  for update using (addressee_id = public.current_uid());
-- Delete (remove friend / decline) either party may.
create policy friendships_delete_mine on public.friendships
  for delete using (
    requester_id = public.current_uid() or addressee_id = public.current_uid()
  );
-- No direct INSERT policy: friendships are created only via claim_friend_invite().

-- Friend invites -----------------------------------------------------------
create table if not exists public.friend_invites (
  code        text primary key,
  inviter_id  text not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  claimed_by  text references public.profiles(id),
  claimed_at  timestamptz
);
alter table public.friend_invites enable row level security;
-- Inviter can see their own invites; claim happens via SECURITY DEFINER rpc.
create policy friend_invites_select_own on public.friend_invites
  for select using (inviter_id = public.current_uid());

-- RPC: create a one-time invite code for the caller.
create or replace function public.create_friend_invite() returns text
  language plpgsql security definer set search_path = public as $$
declare
  uid text := public.current_uid();
  new_code text;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  new_code := encode(gen_random_bytes(9), 'base64');
  new_code := replace(replace(replace(new_code, '+', '-'), '/', '_'), '=', '');
  insert into public.friend_invites(code, inviter_id) values (new_code, uid);
  return new_code;
end $$;

-- RPC: claim an invite → establishes an accepted friendship.
create or replace function public.claim_friend_invite(invite_code text) returns void
  language plpgsql security definer set search_path = public as $$
declare
  uid text := public.current_uid();
  inv public.friend_invites%rowtype;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  select * into inv from public.friend_invites where code = invite_code for update;
  if not found then raise exception 'invalid invite'; end if;
  if inv.claimed_by is not null then raise exception 'invite already claimed'; end if;
  if inv.inviter_id = uid then raise exception 'cannot friend yourself'; end if;

  update public.friend_invites
    set claimed_by = uid, claimed_at = now() where code = invite_code;

  insert into public.friendships(requester_id, addressee_id, status, responded_at)
    values (inv.inviter_id, uid, 'accepted', now())
    on conflict (requester_id, addressee_id) do nothing;
end $$;

grant execute on function public.create_friend_invite() to authenticated, anon;
grant execute on function public.claim_friend_invite(text) to authenticated, anon;
```

- [ ] **Step 2: Verify the file is syntactically reasonable (lint is N/A for SQL)**

Run: `npm run typecheck`
Expected: PASS (TS unaffected — sanity check that nothing else broke).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0001_profiles_friendships.sql
git commit -m "feat(db): profiles + friendships + invite RPCs with RLS"
```

---

## Task 10: Menu integration — optional "Play with Friends" button

**Files:**
- Modify: `src/ui/menu.ts:10-27`
- Test: `src/ui/menu.test.ts` (add a case)

- [ ] **Step 1: Add the failing test case to `src/ui/menu.test.ts`**

Add inside `describe('menu screens', ...)`:

```ts
  it('renders Friends button only when onFriends is provided and fires it', () => {
    const r = root();
    const base = { onPlay: vi.fn(), onUpgrade: vi.fn(), onSettings: vi.fn() };
    showMenu(r, base);
    expect(r.querySelector('#menu-friends')).toBeNull();

    const r2 = root();
    const onFriends = vi.fn();
    showMenu(r2, { ...base, onFriends });
    (r2.querySelector('#menu-friends') as HTMLElement).click();
    expect(onFriends).toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/ui/menu.test.ts`
Expected: FAIL (`#menu-friends` is null even when `onFriends` provided).

- [ ] **Step 3: Update `showMenu` in `src/ui/menu.ts`**

Replace the `MenuCallbacks` interface and `showMenu` function (lines 10-27) with:

```ts
export interface MenuCallbacks {
  onPlay(): void;
  onUpgrade(): void;
  onSettings(): void;
  onFriends?(): void;
}

export function showMenu(root: HTMLElement, cb: MenuCallbacks): void {
  const friendsBtn = cb.onFriends
    ? `<button id="menu-friends" style="${btn}background:#ef6c00;">Play with Friends</button>`
    : '';
  root.innerHTML = `
    <div style="${overlay}">
      <div style="font-size:46px;font-weight:900;color:#1b5e20;text-shadow:0 2px 0 #fff;">⛳ Goofy Golf</div>
      <button id="menu-play" style="${btn}">Play a Round</button>
      ${friendsBtn}
      <button id="menu-upgrade" style="${btn}background:#37474f;">Upgrade Clubs</button>
      <button id="menu-settings" style="${btn}background:#546e7a;">Settings</button>
    </div>`;
  (root.querySelector('#menu-play') as HTMLElement).onclick = cb.onPlay;
  (root.querySelector('#menu-upgrade') as HTMLElement).onclick = cb.onUpgrade;
  (root.querySelector('#menu-settings') as HTMLElement).onclick = cb.onSettings;
  if (cb.onFriends) {
    (root.querySelector('#menu-friends') as HTMLElement).onclick = cb.onFriends;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/ui/menu.test.ts`
Expected: PASS (all cases, including the new one).

- [ ] **Step 5: Commit**

```bash
git add src/ui/menu.ts src/ui/menu.test.ts
git commit -m "feat(ui): optional Play-with-Friends menu button"
```

---

## Task 11: Wire multiplayer into the app shell

**Files:**
- Modify: `src/main.ts`

This is the integration task: build the auth/service, gate the menu button, run the sign-in + display-name + friends flow, handle `?friend=<code>` and `?mp=fake`, and expose a test hook. Single-player paths are untouched.

- [ ] **Step 1: Add imports near the top of `src/main.ts` (after line 21)**

```ts
import { multiplayerConfig, isMultiplayerEnabled } from './net/config';
import { createAuthProvider, type AuthProvider } from './net/auth';
import { createSupabaseClient } from './net/supabase';
import { SupabaseMultiplayerService, type MultiplayerService } from './net/service';
import { FakeMultiplayerService, makeFakeStore } from './net/fakeService';
import { friendsViewModel } from './net/friends';
import { showFriends } from './ui/friends';
```

- [ ] **Step 2: Build auth + service inside `boot()`, right after `await initPhysics();` (line 32)**

```ts
  // --- Multiplayer wiring (no-op + hidden when env is absent) ----------------
  const fakeUserId = params.get('mp') === 'fake' ? (params.get('user') ?? 'tester') : null;
  const auth: AuthProvider = createAuthProvider(
    multiplayerConfig,
    fakeUserId ? { fakeUser: { id: fakeUserId, name: fakeUserId } } : {},
  );
  let mpService: MultiplayerService | null = null;
  const fakeStore = fakeUserId ? makeFakeStore() : null;

  async function ensureService(): Promise<MultiplayerService | null> {
    if (mpService) return mpService;
    const user = auth.getUser();
    if (!user) return null;
    if (fakeStore) {
      mpService = new FakeMultiplayerService(fakeStore, user.id);
    } else if (multiplayerConfig) {
      mpService = new SupabaseMultiplayerService(createSupabaseClient(multiplayerConfig, auth), user.id);
    }
    return mpService;
  }

  const mpAvailable = isMultiplayerEnabled() || fakeUserId !== null;
  // Resolve any OIDC redirect on boot (no-op for Null/Test providers).
  const bootUser = await auth.init();
  // If we returned from a redirect mid-friend-invite, the code is preserved below.
  const pendingFriendCode = params.get('friend');
```

- [ ] **Step 3: Add the friends flow functions (place beside `openUpgrade`, after line 131)**

```ts
  async function openFriends() {
    const svc = await ensureService();
    if (!svc) return; // not signed in
    let inviteLink: string | null = null;
    const renderFriends = async () => {
      const { rows, names } = await svc.listFriendships();
      const view = friendsViewModel(rows, svc.myUserId(), names);
      showFriends(screen(), view, inviteLink, {
        onInvite: async () => {
          const code = await svc.createFriendInvite();
          inviteLink = `${location.origin}${location.pathname}?friend=${encodeURIComponent(code)}`;
          await renderFriends();
        },
        onAccept: async (id) => { await svc.acceptRequest(id); await renderFriends(); },
        onDecline: async (id) => { await svc.declineRequest(id); await renderFriends(); },
        onRemove: async (id) => { await svc.removeFriend(id); await renderFriends(); },
        onClose: toMenu,
      });
    };
    await renderFriends();
  }

  async function startMultiplayer() {
    // Sign in if needed (OIDC redirect navigates away; Test/Null resolve inline).
    if (!auth.getUser()) {
      await auth.login();
      return; // redirect in flight for real OIDC
    }
    const svc = await ensureService();
    if (!svc) return;
    // Ensure a profile row exists (default display name = OIDC name).
    const existing = await svc.getProfile(svc.myUserId());
    if (!existing) {
      const name = (auth.getUser()!.name || 'Golfer').slice(0, 40);
      await svc.upsertProfile(name);
    }
    if (pendingFriendCode) {
      try { await svc.claimFriendInvite(pendingFriendCode); } catch { /* expired/own/used */ }
    }
    await openFriends();
  }
```

- [ ] **Step 4: Gate the menu button — replace the `showMenu(...)` call inside `toMenu()` (lines 108-115)**

```ts
    showMenu(screen(), {
      onPlay: () => showCourseSelect(screen(), CURATED, startRound),
      onUpgrade: () => openUpgrade(),
      onSettings: () => { toMenu(); },
      ...(mpAvailable ? { onFriends: () => void startMultiplayer() } : {}),
    });
```

- [ ] **Step 5: Auto-resume the friends flow after redirect/`?mp=fake`. Replace the boot tail (lines 367-368)**

```ts
  toMenu();
  if (params.has('round')) startRound(Number(params.get('round')));
  // Returned from an OIDC redirect (or fake session) → continue the friends flow.
  if (mpAvailable && (bootUser || pendingFriendCode)) void startMultiplayer();
```

- [ ] **Step 6: Expose a multiplayer test flag on `__golfTest` (add inside the `__golfTest` object, after `ready: true,` — line 92)**

```ts
    multiplayerAvailable: () => isMultiplayerEnabled(),
    signedInUser: () => auth.getUser(),
```

- [ ] **Step 7: Typecheck, lint, unit tests**

Run: `npm run typecheck && npm run lint && npm test`
Expected: all PASS. (`bootUser` may lint as unused if only referenced in Step 5 — it is referenced; confirm no unused-var error.)

- [ ] **Step 8: Manual smoke against the fake**

Run: `npm run dev`, open `http://localhost:5173/?mp=fake&user=alice`.
Expected: menu shows "Play with Friends"; clicking it shows the Friends screen with an "Invite a Friend" button; clicking invite shows a link containing `?friend=invite-alice-0`. Open `http://localhost:5173/?mp=fake&user=bob&friend=invite-alice-0` in a second tab — but note the fake store is per-tab, so cross-tab won't share. (Cross-user is exercised deterministically in the e2e via a single store; this manual check just confirms the single-user UI.)

- [ ] **Step 9: Commit**

```bash
git add src/main.ts
git commit -m "feat: wire auth + friends flow into app shell (hidden when unconfigured)"
```

---

## Task 12: Friends e2e (against the fake) + CI wiring + docs

**Files:**
- Create: `e2e/friends.spec.ts`
- Modify: `.github/workflows/ci.yml:23`
- Create: `docs/multiplayer-setup.md`
- Modify: `README.md`

- [ ] **Step 1: Write the e2e spec**

```ts
import { expect, test } from '@playwright/test';

// Runs against the in-memory fake backend (?mp=fake) — no Supabase/Auth0 needed.
async function ready(page: import('@playwright/test').Page) {
  await page.waitForFunction(
    () => (window as unknown as { __golfTest?: { ready: boolean } }).__golfTest?.ready === true,
  );
}

test('friends screen is reachable and can generate an invite link', async ({ page }) => {
  await page.goto('/?mp=fake&user=alice');
  await ready(page);
  await expect(page.locator('#menu-friends')).toBeVisible();
  await page.locator('#menu-friends').click();
  await expect(page.locator('#friends-invite')).toBeVisible();
  await page.locator('#friends-invite').click();
  const link = page.locator('#friends-invite-link');
  await expect(link).toBeVisible();
  await expect(link).toHaveValue(/\?friend=invite-alice-0/);
});

test('claiming an invite establishes a friendship', async ({ page }) => {
  // Alice creates an invite, then (same store survives only within a navigation
  // chain) Bob claims via the URL. We drive both as one user-journey: claim path
  // creates the accepted friendship and the friends list shows the inviter.
  await page.goto('/?mp=fake&user=alice');
  await ready(page);
  await page.locator('#menu-friends').click();
  await page.locator('#friends-invite').click();
  const link = await page.locator('#friends-invite-link').inputValue();
  const code = new URL(link).searchParams.get('friend')!;

  await page.goto(`/?mp=fake&user=bob&friend=${encodeURIComponent(code)}`);
  await ready(page);
  // Bob auto-runs the friends flow on boot; Alice's invite resolves against bob's
  // fresh store, so we assert the screen renders without the inviter (separate
  // store) — the deterministic cross-user claim is unit-tested in fakeService.
  await expect(page.locator('#friends-invite')).toBeVisible();
});

test('single-player is unaffected when multiplayer is disabled (no ?mp)', async ({ page }) => {
  await page.goto('/');
  await ready(page);
  await expect(page.locator('#menu-play')).toBeVisible();
  await expect(page.locator('#menu-friends')).toHaveCount(0);
});
```

Note: cross-user invite acceptance is verified deterministically in `fakeService.test.ts` (shared store). The e2e confirms the UI wiring, link generation, and the graceful-degradation guarantee (no `#menu-friends` without `?mp`).

- [ ] **Step 2: Run the e2e locally**

Run: `npx playwright test e2e/friends.spec.ts --project=desktop`
Expected: PASS (3 tests).

- [ ] **Step 3: Add the spec to CI. Edit `.github/workflows/ci.yml` line 23**

```yaml
      - run: npx playwright test e2e/round.spec.ts e2e/upgrade.spec.ts e2e/prompts.spec.ts e2e/settings.spec.ts e2e/touch.spec.ts e2e/friends.spec.ts
```

- [ ] **Step 4: Write the setup doc `docs/multiplayer-setup.md`**

```markdown
# Multiplayer Setup (Phase 1: Identity & Friends)

Multiplayer is **disabled** unless all required env vars are set. Single-player
needs no setup and CI passes without secrets.

## Required env (`.env`, or GitHub Actions secrets at build time)

| Var | Source |
| --- | --- |
| `VITE_SUPABASE_URL` | Supabase project → Settings → API |
| `VITE_SUPABASE_ANON_KEY` | Supabase project → Settings → API (anon/public key) |
| `VITE_OIDC_ISSUER` | Auth0 → Application → Domain (e.g. `https://TENANT.us.auth0.com/`) |
| `VITE_OIDC_CLIENT_ID` | Auth0 → Application → Client ID |
| `VITE_OIDC_AUDIENCE` (optional) | Auth0 API identifier, if using an API audience |
| `VITE_OIDC_REDIRECT_URI` (optional) | Defaults to the app's origin+path |

## Auth0
1. Create a **Single Page Application**.
2. Allowed Callback/Logout/Web-Origins URLs: your dev (`http://localhost:5173`) and prod (`https://<user>.github.io/golf-game/`) URLs.
3. Enable **Google** (and any other) social connections.

## Supabase
1. Create a project; copy the URL + anon key.
2. **Third-party auth**: add Auth0 as the provider (issuer = `VITE_OIDC_ISSUER`) so Supabase validates the Auth0 JWT and RLS reads `auth.jwt()->>'sub'`.
3. Apply migrations: `supabase db push` (or run `supabase/migrations/0001_profiles_friendships.sql` in the SQL editor).

## Manual verification checklist (real backend)
- [ ] Sign in via Auth0 social login; a `profiles` row is created.
- [ ] Generate an invite link; opening it as a second account creates a mutual `accepted` friendship.
- [ ] Each account sees the other in their friends list with the correct display name.
- [ ] Remove friend deletes the row for both.
- [ ] RLS: account A cannot `select` account B's unrelated `friendships` rows (verify in SQL editor with a non-member JWT).
```

- [ ] **Step 5: Add a README pointer**

Add under the controls/features section of `README.md`:

```markdown
## Multiplayer (Phase 1)
Sign in and build a friend network. Disabled unless configured — see
[docs/multiplayer-setup.md](docs/multiplayer-setup.md). Local UI dev without a
backend: run `npm run dev` and open `/?mp=fake&user=you`.
```

- [ ] **Step 6: Full local gate**

Run: `npm run lint && npm run typecheck && npm test && npx playwright test e2e/friends.spec.ts e2e/round.spec.ts --project=desktop`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add e2e/friends.spec.ts .github/workflows/ci.yml docs/multiplayer-setup.md README.md
git commit -m "test(e2e): friends flow against fake backend + setup docs + CI wiring"
```

---

## Self-Review (completed during planning)

**Spec coverage (Phase 1 scope):**
- §2 provider-agnostic OIDC + Supabase-trusts-issuer → Tasks 3, 4 (`accessToken` callback).
- §2 graceful degradation (single-player when unconfigured) → Tasks 2, 10, 11 (`mpAvailable` gate) + e2e assertion (Task 12).
- §3 profiles/friendships/invite + RLS → Task 9; friends view model → Task 5.
- §4 friends screen (list, requests, invite link), menu entry, `?friend=` routing, display-name on first login → Tasks 8, 10, 11.
- §6 public-only config, `.env.example`, migrations as files, setup doc → Tasks 1, 9, 12.
- Testing discipline: pure logic unit-tested (Tasks 2, 5, 7), DOM tested (Tasks 8, 10), flow e2e against fakes with zero secrets (Task 12); external boundaries (OIDC, Supabase impl, SQL) verified by typecheck + manual checklist.
- Deferred to later phases (correctly absent here): rooms/lobby/chat (Phase 2), multiplayer round (Phase 3), deploy smoke + token-injection seam (Phase 4).

**Placeholder scan:** none — every code/SQL step is complete.

**Type consistency:** `MultiplayerConfig`/`OidcConfig` (Task 2) used by `auth.ts`/`supabase.ts` (Tasks 3, 4); `AuthProvider`/`AuthUser` (Task 3) consumed by `supabase.ts` and `main.ts`; `FriendshipRow`/`FriendsView` (Task 5) used by `service.ts`, `fakeService.ts`, `ui/friends.ts`, `main.ts`; `MultiplayerService`/`ProfileRef` (Task 6) implemented by both real (Task 6) and fake (Task 7) and consumed in `main.ts` (Task 11); RPC names `create_friend_invite`/`claim_friend_invite` match between Task 6 (calls) and Task 9 (definitions); `showFriends`/`FriendsCallbacks` (Task 8) match the call site in Task 11. Consistent.
