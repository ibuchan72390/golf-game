import { describe, expect, it } from 'vitest';
import { CLUBS, launchVelocity, effectiveStats, BASE_LOADOUT } from './clubs';

describe('CLUBS', () => {
  it('has eight clubs', () => {
    expect(Object.keys(CLUBS).length).toBe(8);
  });
});

describe('effectiveStats', () => {
  it('zero levels equals base', () => {
    expect(effectiveStats('driver', { power: 0, accuracy: 0, forgiveness: 0, spin: 0 })).toEqual(CLUBS.driver);
  });
  it('power raises max speed; accuracy tightens dispersion', () => {
    const s = effectiveStats('iron7', { power: 3, accuracy: 2, forgiveness: 0, spin: 0 });
    expect(s.maxSpeed).toBeGreaterThan(CLUBS.iron7.maxSpeed);
    expect(s.accuracy).toBeLessThan(CLUBS.iron7.accuracy);
  });
  it('forgiveness and spin rise but stay clamped ≤ 0.95', () => {
    const s = effectiveStats('sandWedge', { power: 0, accuracy: 0, forgiveness: 20, spin: 20 });
    expect(s.forgiveness).toBeLessThanOrEqual(0.95);
    expect(s.spin).toBeLessThanOrEqual(0.95);
  });
  it('BASE_LOADOUT is all clubs at base', () => {
    expect(BASE_LOADOUT.driver).toEqual(CLUBS.driver);
    expect(Object.keys(BASE_LOADOUT).length).toBe(8);
  });
});

describe('launchVelocity', () => {
  it('full-power pure strike at aim 0 flies straight down -Z', () => {
    const v = launchVelocity(CLUBS.driver, { club: 'driver', aimDir: 0, power: 1, contactError: 0 }, 1);
    expect(v.x).toBeCloseTo(0, 6);
    expect(v.z).toBeLessThan(0);
    expect(v.y).toBeGreaterThan(0);
    expect(Math.hypot(v.x, v.y, v.z)).toBeCloseTo(CLUBS.driver.maxSpeed, 6);
  });

  it('aimDir π/2 flies toward +X', () => {
    const v = launchVelocity(CLUBS.driver, { club: 'driver', aimDir: Math.PI / 2, power: 1, contactError: 0 }, 1);
    expect(v.x).toBeGreaterThan(5);
    expect(v.z).toBeCloseTo(0, 6);
  });

  it('power scales speed linearly', () => {
    const half = launchVelocity(CLUBS.iron7, { club: 'iron7', aimDir: 0, power: 0.5, contactError: 0 }, 1);
    expect(Math.hypot(half.x, half.y, half.z)).toBeCloseTo(CLUBS.iron7.maxSpeed * 0.5, 6);
  });

  it('positive contactError pushes the shot offline', () => {
    const v = launchVelocity(CLUBS.driver, { club: 'driver', aimDir: 0, power: 1, contactError: 1 }, 1);
    expect(Math.abs(v.x)).toBeGreaterThan(0.5);
  });

  it('putter launches flat', () => {
    const v = launchVelocity(CLUBS.putter, { club: 'putter', aimDir: 0, power: 0.5, contactError: 0 }, 1);
    expect(v.y).toBeCloseTo(0, 6);
  });
});
