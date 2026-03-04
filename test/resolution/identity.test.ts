import { describe, it, expect } from 'vitest';
import { TIER_CONFIDENCE, type IdentityResolutionTier } from '../../src/domain/identity.types.js';

describe('TIER_CONFIDENCE', () => {
  it('tier 1 should have confidence 0.98', () => {
    expect(TIER_CONFIDENCE[1]).toBe(0.98);
  });

  it('tier 2 should have confidence 0.92', () => {
    expect(TIER_CONFIDENCE[2]).toBe(0.92);
  });

  it('tier 3 should have confidence 0.85', () => {
    expect(TIER_CONFIDENCE[3]).toBe(0.85);
  });

  it('tier 4 should have confidence 0.78', () => {
    expect(TIER_CONFIDENCE[4]).toBe(0.78);
  });

  it('tier 5 should have confidence 0.65', () => {
    expect(TIER_CONFIDENCE[5]).toBe(0.65);
  });

  it('tier 6 should have confidence 0.0 (unresolved)', () => {
    expect(TIER_CONFIDENCE[6]).toBe(0.0);
  });

  it('should decrease monotonically from tier 1 to tier 6', () => {
    const tiers: IdentityResolutionTier[] = [1, 2, 3, 4, 5, 6];
    for (let i = 1; i < tiers.length; i++) {
      expect(TIER_CONFIDENCE[tiers[i]!]).toBeLessThan(TIER_CONFIDENCE[tiers[i - 1]!]);
    }
  });

  it('should have all 6 tiers defined', () => {
    expect(Object.keys(TIER_CONFIDENCE)).toHaveLength(6);
  });

  it('should group tiers correctly: high (1-3 >= 0.85), medium (4-5), unresolved (6 = 0)', () => {
    expect(TIER_CONFIDENCE[1]).toBeGreaterThanOrEqual(0.85);
    expect(TIER_CONFIDENCE[2]).toBeGreaterThanOrEqual(0.85);
    expect(TIER_CONFIDENCE[3]).toBeGreaterThanOrEqual(0.85);
    expect(TIER_CONFIDENCE[4]).toBeLessThan(0.85);
    expect(TIER_CONFIDENCE[4]).toBeGreaterThan(0);
    expect(TIER_CONFIDENCE[5]).toBeLessThan(0.85);
    expect(TIER_CONFIDENCE[5]).toBeGreaterThan(0);
    expect(TIER_CONFIDENCE[6]).toBe(0);
  });
});
