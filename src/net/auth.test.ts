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
