import { describe, expect, it } from 'vitest';
import { DEFAULT_PROFILE, loadProfile, saveProfile, type Profile } from './profile';

function fakeStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    dump: () => Object.fromEntries(map),
  };
}

describe('profile', () => {
  it('missing profile → defaults (v0 → v1 migration)', () => {
    expect(loadProfile(fakeStorage())).toEqual(DEFAULT_PROFILE);
  });
  it('corrupt JSON → defaults, no throw', () => {
    expect(loadProfile(fakeStorage({ 'golf-profile': '{not json' }))).toEqual(DEFAULT_PROFILE);
  });
  it('wrong version → defaults', () => {
    expect(loadProfile(fakeStorage({ 'golf-profile': '{"version":99}' }))).toEqual(DEFAULT_PROFILE);
  });
  it('round-trips', () => {
    const s = fakeStorage();
    const p: Profile = { version: 1, settings: { inputScheme: 'threeClick' } };
    saveProfile(s, p);
    expect(loadProfile(s)).toEqual(p);
  });
});
