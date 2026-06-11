import { describe, expect, it } from 'vitest';
import { ThreeClickMeter, meterValue } from './threeClick';

describe('meterValue', () => {
  it('oscillates 0 → 1 → 0 over one period', () => {
    expect(meterValue(0, 1600)).toBeCloseTo(0);
    expect(meterValue(400, 1600)).toBeCloseTo(0.5);
    expect(meterValue(800, 1600)).toBeCloseTo(1);
    expect(meterValue(1200, 1600)).toBeCloseTo(0.5);
    expect(meterValue(1600, 1600)).toBeCloseTo(0);
  });
});

describe('ThreeClickMeter', () => {
  it('walks idle → power → accuracy → done and emits an intent', () => {
    const m = new ThreeClickMeter();
    expect(m.phase).toBe('idle');
    m.begin(1000);
    expect(m.phase).toBe('power');
    m.click(1000 + 800); // meter at peak → full power
    expect(m.phase).toBe('accuracy');
    m.click(1000 + 1600 + 160); // value 0.2, just past target 0.1
    expect(m.phase).toBe('done');
    const r = m.result();
    expect(r.power).toBeCloseTo(1);
    expect(r.contactError).toBeCloseTo((0.2 - 0.1) / 0.9, 5);
  });

  it('clicking the accuracy target exactly gives pure contact', () => {
    const m = new ThreeClickMeter();
    m.begin(0);
    m.click(800);
    m.click(1600 + 80); // value 0.1 === target
    expect(m.result().contactError).toBeCloseTo(0, 5);
  });

  it('contactError stays within [-1, 1]', () => {
    const m = new ThreeClickMeter();
    m.begin(0);
    m.click(800);
    m.click(1600); // value 0 → below target → small negative error
    expect(m.result().contactError).toBeGreaterThanOrEqual(-1);
    expect(m.result().contactError).toBeLessThanOrEqual(1);
    expect(m.result().contactError).toBeLessThan(0);
  });
});
