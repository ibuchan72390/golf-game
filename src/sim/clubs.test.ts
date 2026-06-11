import { describe, expect, it } from 'vitest';
import { CLUBS, launchVelocity } from './clubs';

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
