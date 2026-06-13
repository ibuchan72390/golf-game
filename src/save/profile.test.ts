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
    const p: Profile = { ...DEFAULT_PROFILE, settings: { inputScheme: 'threeClick' } };
    saveProfile(s, p);
    expect(loadProfile(s)).toEqual(p);
  });
});

describe('profile v2', () => {
  it('default profile is v2 with zeroed progression', () => {
    expect(DEFAULT_PROFILE.version).toBe(2);
    expect(DEFAULT_PROFILE.skillPoints).toBe(0);
    expect(DEFAULT_PROFILE.clubLevels.driver).toEqual({ power: 0, accuracy: 0, forgiveness: 0, spin: 0 });
    expect(Object.keys(DEFAULT_PROFILE.clubLevels).length).toBe(8);
  });

  it('migrates a v1 profile, preserving input scheme and zeroing progression', () => {
    const v1 = JSON.stringify({ version: 1, settings: { inputScheme: 'threeClick' } });
    const p = loadProfile(fakeStorage({ 'golf-profile': v1 }));
    expect(p.version).toBe(2);
    expect(p.settings.inputScheme).toBe('threeClick');
    expect(p.skillPoints).toBe(0);
  });

  it('missing or corrupt → default v2', () => {
    expect(loadProfile(fakeStorage())).toEqual(DEFAULT_PROFILE);
    expect(loadProfile(fakeStorage({ 'golf-profile': '{bad' }))).toEqual(DEFAULT_PROFILE);
  });

  it('round-trips a v2 profile with progression', () => {
    const s = fakeStorage();
    const p: Profile = { ...DEFAULT_PROFILE, skillPoints: 12, clubLevels: { ...DEFAULT_PROFILE.clubLevels, driver: { power: 3, accuracy: 1, forgiveness: 0, spin: 0 } }, bestScores: { 'seed:42': 38 } };
    saveProfile(s, p);
    expect(loadProfile(s)).toEqual(p);
  });
});
