import { describe, it, expect, afterEach } from 'vitest';
import { getClock, setFixedClock, resetClock } from '../../../src/lib/time/clock.js';

describe('Clock', () => {
  afterEach(() => {
    resetClock();
  });

  it('system clock returns current time', () => {
    const before = Date.now();
    const now = getClock().now().getTime();
    const after = Date.now();
    expect(now).toBeGreaterThanOrEqual(before);
    expect(now).toBeLessThanOrEqual(after);
  });

  it('fixed clock returns fixed time', () => {
    const fixed = new Date('2024-01-15T12:00:00Z');
    setFixedClock(fixed);
    expect(getClock().now().toISOString()).toBe('2024-01-15T12:00:00.000Z');
    expect(getClock().isoNow()).toBe('2024-01-15T12:00:00.000Z');
  });
});
