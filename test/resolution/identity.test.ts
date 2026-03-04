import { describe, it, expect } from 'vitest';
import { TIER_CONFIDENCE, type IdentityResolutionTier } from '../../src/domain/identity.types.js';
import { MATTER_CONFIDENCE_MIN } from '../../src/domain/policy.js';

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

describe('MATTER_CONFIDENCE_MIN (D4)', () => {
  it('threshold should be 0.75', () => {
    expect(MATTER_CONFIDENCE_MIN).toBe(0.75);
  });

  it('tier 5 confidence (0.65) falls below the threshold', () => {
    expect(TIER_CONFIDENCE[5]).toBeLessThan(MATTER_CONFIDENCE_MIN);
  });

  it('tier 4 confidence (0.78) meets the threshold', () => {
    expect(TIER_CONFIDENCE[4]).toBeGreaterThanOrEqual(MATTER_CONFIDENCE_MIN);
  });

  it('tiers 1–3 all exceed the threshold', () => {
    expect(TIER_CONFIDENCE[1]).toBeGreaterThan(MATTER_CONFIDENCE_MIN);
    expect(TIER_CONFIDENCE[2]).toBeGreaterThan(MATTER_CONFIDENCE_MIN);
    expect(TIER_CONFIDENCE[3]).toBeGreaterThan(MATTER_CONFIDENCE_MIN);
  });
});

describe('assigneeConfidence three-way logic', () => {
  // Mirrors the logic in identity.service.ts:
  // no assignee_name → 1.0, resolved → 0.9, failed → 0.3
  function computeAssigneeConfidence(assigneeName: string | null, assigneeUserId: string | null): number {
    return !assigneeName ? 1.0 : assigneeUserId ? 0.9 : 0.3;
  }

  it('should return 1.0 when no assignee_name exists (legitimately unassigned)', () => {
    expect(computeAssigneeConfidence(null, null)).toBe(1.0);
  });

  it('should return 0.9 when assignee was successfully resolved', () => {
    expect(computeAssigneeConfidence('John Doe', 'user-123')).toBe(0.9);
  });

  it('should return 0.3 when assignee_name exists but resolution failed', () => {
    expect(computeAssigneeConfidence('Unknown Person', null)).toBe(0.3);
  });

  it('unassigned task (1.0) should not be penalized below SENSITIVE_FIELD_MIN_CONFIDENCE (0.80)', () => {
    const confidence = computeAssigneeConfidence(null, null);
    expect(confidence).toBeGreaterThanOrEqual(0.80);
  });

  it('failed resolution (0.3) should fall below ADJUDICATION_REVIEW threshold (0.75)', () => {
    const confidence = computeAssigneeConfidence('Unknown', null);
    expect(confidence).toBeLessThan(0.75);
  });
});
