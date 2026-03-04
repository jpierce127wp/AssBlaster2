import { describe, it, expect } from 'vitest';
import { DeterministicDedup } from '../../src/dedupe/dedup.deterministic.js';
import { DEDUP_THRESHOLDS } from '../../src/domain/dedup.types.js';

describe('DeterministicDedup', () => {
  describe('computeFingerprint', () => {
    it('should produce consistent fingerprints for same inputs', () => {
      const f1 = DeterministicDedup.computeFingerprint('File motion to compel', 'Johnson', 'filing', '2026-03-15');
      const f2 = DeterministicDedup.computeFingerprint('File motion to compel', 'Johnson', 'filing', '2026-03-15');
      expect(f1).toEqual(f2);
    });

    it('should normalize whitespace and case', () => {
      const f1 = DeterministicDedup.computeFingerprint('File Motion To Compel', 'Johnson', 'Filing', '2026-03-15');
      const f2 = DeterministicDedup.computeFingerprint('file  motion  to  compel', 'johnson', 'filing', '2026-03-15');
      expect(f1).toEqual(f2);
    });

    it('should produce different fingerprints for different summaries', () => {
      const f1 = DeterministicDedup.computeFingerprint('File motion to compel', 'Johnson', 'filing', '2026-03-15');
      const f2 = DeterministicDedup.computeFingerprint('Schedule deposition', 'Johnson', 'deposition', '2026-03-15');
      expect(f1).not.toEqual(f2);
    });

    it('should produce different fingerprints for different matters', () => {
      const f1 = DeterministicDedup.computeFingerprint('File motion', 'Johnson', 'filing', '2026-03-15');
      const f2 = DeterministicDedup.computeFingerprint('File motion', 'Martinez', 'filing', '2026-03-15');
      expect(f1).not.toEqual(f2);
    });

    it('should handle null matter and due date', () => {
      const f1 = DeterministicDedup.computeFingerprint('File motion', null, 'filing', null);
      const f2 = DeterministicDedup.computeFingerprint('File motion', null, 'filing', null);
      expect(f1).toEqual(f2);
    });

    it('should include action_type in fingerprint', () => {
      const f1 = DeterministicDedup.computeFingerprint('Review documents', 'Johnson', 'discovery', '2026-03-15');
      const f2 = DeterministicDedup.computeFingerprint('Review documents', 'Johnson', 'research', '2026-03-15');
      expect(f1).not.toEqual(f2);
    });
  });
});

describe('DEDUP_THRESHOLDS', () => {
  it('should have correct threshold ordering', () => {
    expect(DEDUP_THRESHOLDS.AUTO_MERGE).toBeGreaterThan(DEDUP_THRESHOLDS.CREATE_NEW);
    expect(DEDUP_THRESHOLDS.AUTO_MERGE).toBe(0.90);
    expect(DEDUP_THRESHOLDS.CREATE_NEW).toBe(0.75);
    expect(DEDUP_THRESHOLDS.ADJUDICATION_REVIEW).toBe(0.75);
  });
});
