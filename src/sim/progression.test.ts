import { describe, expect, it } from 'vitest';
import { awardPoints, upgradeCost, buyUpgrade, loadoutFromProfile } from './progression';
import { DEFAULT_PROFILE } from '../save/profile';
import { CLUBS } from './clubs';

describe('awardPoints', () => {
  it('always pays a generous baseline, scaled up by difficulty and good scores', () => {
    const easyPar = awardPoints(0.2, 0);     // easy course, even par
    const hardUnder = awardPoints(0.9, -4);  // hard course, 4 under
    const blowup = awardPoints(0.5, 12);     // big over-par
    expect(easyPar).toBeGreaterThanOrEqual(20);
    expect(hardUnder).toBeGreaterThan(easyPar);
    expect(blowup).toBeGreaterThanOrEqual(10); // never punishing-to-zero
  });
});

describe('upgradeCost', () => {
  it('ramps with level', () => {
    expect(upgradeCost(0)).toBeLessThan(upgradeCost(3));
    expect(upgradeCost(0)).toBeGreaterThan(0);
  });
});

describe('buyUpgrade', () => {
  it('spends points and raises the level when affordable', () => {
    const p = { ...DEFAULT_PROFILE, skillPoints: 100 };
    const next = buyUpgrade(p, 'driver', 'power');
    expect(next).not.toBeNull();
    expect(next!.clubLevels.driver.power).toBe(1);
    expect(next!.skillPoints).toBe(100 - upgradeCost(0));
  });
  it('returns null when unaffordable', () => {
    const p = { ...DEFAULT_PROFILE, skillPoints: 0 };
    expect(buyUpgrade(p, 'driver', 'power')).toBeNull();
  });
  it('caps at the max level', () => {
    const p = { ...DEFAULT_PROFILE, skillPoints: 100000, clubLevels: { ...DEFAULT_PROFILE.clubLevels, driver: { power: 10, accuracy: 0, forgiveness: 0, spin: 0 } } };
    expect(buyUpgrade(p, 'driver', 'power')).toBeNull(); // already at cap
  });
});

describe('loadoutFromProfile', () => {
  it('base profile yields base stats; upgrades raise them', () => {
    const base = loadoutFromProfile(DEFAULT_PROFILE);
    expect(base.driver.maxSpeed).toBe(CLUBS.driver.maxSpeed);
    const up = loadoutFromProfile({ ...DEFAULT_PROFILE, clubLevels: { ...DEFAULT_PROFILE.clubLevels, driver: { power: 5, accuracy: 0, forgiveness: 0, spin: 0 } } });
    expect(up.driver.maxSpeed).toBeGreaterThan(CLUBS.driver.maxSpeed);
  });
});
