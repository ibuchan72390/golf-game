import { describe, expect, it } from 'vitest';
import { CHARGE_MS, HoldReleaseMeter } from './holdRelease';

describe('HoldReleaseMeter', () => {
  it('walks idle → charging → contact → done', () => {
    const m = new HoldReleaseMeter();
    expect(m.phase).toBe('idle');
    expect(m.stage()).toBe('ready');
    m.press(1000);
    expect(m.phase).toBe('charging');
    expect(m.stage()).toBe('charging');
    m.release(1000 + CHARGE_MS); // held full duration → power 1
    expect(m.phase).toBe('contact');
    expect(m.stage()).toBe('contact');
    m.tap(1000 + CHARGE_MS + 225); // contact bar at value 0.5 = band center (period 900)
    expect(m.phase).toBe('done');
    const r = m.result();
    expect(r.power).toBeCloseTo(1);
    expect(r.contactError).toBeCloseTo(0, 5);
  });

  it('short hold gives partial power; over-hold caps at 1', () => {
    const m = new HoldReleaseMeter();
    m.press(0);
    m.release(CHARGE_MS / 2);
    m.tap(CHARGE_MS / 2 + 225);
    expect(m.result().power).toBeCloseTo(0.5);

    const m2 = new HoldReleaseMeter();
    m2.press(0);
    m2.release(CHARGE_MS * 3);
    expect(m2.powerValue()).toBeCloseTo(1);
  });

  it('early/late taps produce signed contactError in [-1, 1]', () => {
    const early = new HoldReleaseMeter();
    early.press(0);
    early.release(CHARGE_MS);
    early.tap(CHARGE_MS + 90); // value 0.2 < 0.5 → negative
    expect(early.result().contactError).toBeLessThan(0);
    expect(early.result().contactError).toBeGreaterThanOrEqual(-1);

    const late = new HoldReleaseMeter();
    late.press(0);
    late.release(CHARGE_MS);
    late.tap(CHARGE_MS + 360); // value 0.8 > 0.5 → positive
    expect(late.result().contactError).toBeGreaterThan(0);
    expect(late.result().contactError).toBeLessThanOrEqual(1);
  });

  it('value() exposes the active bar for the HUD', () => {
    const m = new HoldReleaseMeter();
    m.press(0);
    expect(m.value(CHARGE_MS / 2)).toBeCloseTo(0.5); // charging: power fill
    m.release(CHARGE_MS);
    expect(m.value(CHARGE_MS + 225)).toBeCloseTo(0.5); // contact: sweep position
  });

  it('reset returns to idle', () => {
    const m = new HoldReleaseMeter();
    m.press(0);
    m.reset();
    expect(m.phase).toBe('idle');
    expect(m.stage()).toBe('ready');
  });
});
