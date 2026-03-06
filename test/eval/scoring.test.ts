import { describe, it, expect } from 'vitest';
import { Scorer, type ScenarioResult } from '../../src/eval/scoring.js';

describe('Scorer', () => {
  const scorer = new Scorer();

  describe('precision', () => {
    it('returns correct value for known inputs', () => {
      expect(scorer.precision(8, 2)).toBeCloseTo(0.8);
    });

    it('returns 1.0 when no false positives', () => {
      expect(scorer.precision(10, 0)).toBeCloseTo(1.0);
    });

    it('returns 0 when tp + fp is zero', () => {
      expect(scorer.precision(0, 0)).toBe(0);
    });

    it('returns 0 when no true positives', () => {
      expect(scorer.precision(0, 5)).toBeCloseTo(0.0);
    });
  });

  describe('recall', () => {
    it('returns correct value for known inputs', () => {
      expect(scorer.recall(8, 2)).toBeCloseTo(0.8);
    });

    it('returns 1.0 when no false negatives', () => {
      expect(scorer.recall(10, 0)).toBeCloseTo(1.0);
    });

    it('returns 0 when tp + fn is zero', () => {
      expect(scorer.recall(0, 0)).toBe(0);
    });
  });

  describe('f1', () => {
    it('returns correct F1 for known precision and recall', () => {
      // precision=0.8, recall=0.6 → F1 = 2*0.8*0.6/(0.8+0.6) ≈ 0.6857
      expect(scorer.f1(0.8, 0.6)).toBeCloseTo(0.6857, 3);
    });

    it('returns 0 when both precision and recall are 0', () => {
      expect(scorer.f1(0, 0)).toBe(0);
    });

    it('returns 1.0 when both are 1.0', () => {
      expect(scorer.f1(1.0, 1.0)).toBeCloseTo(1.0);
    });
  });

  describe('scoreScenarioResults', () => {
    it('returns zeroed report for empty results', () => {
      const report = scorer.scoreScenarioResults([]);
      expect(report.overall.total).toBe(0);
      expect(report.overall.passed).toBe(0);
      expect(report.overall.accuracy).toBe(0);
      expect(report.scenarioResults).toEqual([]);
    });

    it('handles single passing result', () => {
      const results: ScenarioResult[] = [
        { scenarioName: 'test', passed: true, category: 'dedup', details: 'ok', assertions: [] },
      ];
      const report = scorer.scoreScenarioResults(results);
      expect(report.overall.total).toBe(1);
      expect(report.overall.passed).toBe(1);
      expect(report.overall.accuracy).toBeCloseTo(1.0);
    });

    it('handles single failing result', () => {
      const results: ScenarioResult[] = [
        { scenarioName: 'test', passed: false, category: 'dedup', details: 'fail', assertions: [] },
      ];
      const report = scorer.scoreScenarioResults(results);
      expect(report.overall.total).toBe(1);
      expect(report.overall.failed).toBe(1);
      expect(report.overall.accuracy).toBeCloseTo(0.0);
    });

    it('handles mixed results', () => {
      const results: ScenarioResult[] = [
        { scenarioName: 'a', passed: true, category: 'dedup', details: '', assertions: [] },
        { scenarioName: 'b', passed: false, category: 'dedup', details: '', assertions: [] },
        { scenarioName: 'c', passed: true, category: 'extraction', details: '', assertions: [] },
      ];
      const report = scorer.scoreScenarioResults(results);
      expect(report.overall.total).toBe(3);
      expect(report.overall.passed).toBe(2);
      expect(report.overall.failed).toBe(1);
    });

    it('groups by category', () => {
      const results: ScenarioResult[] = [
        { scenarioName: 'a', passed: true, category: 'dedup', details: '', assertions: [] },
        { scenarioName: 'b', passed: false, category: 'dedup', details: '', assertions: [] },
        { scenarioName: 'c', passed: true, category: 'identity', details: '', assertions: [] },
      ];
      const report = scorer.scoreScenarioResults(results);
      expect(report.byCategory['dedup']!.total).toBe(2);
      expect(report.byCategory['dedup']!.passed).toBe(1);
      expect(report.byCategory['identity']!.total).toBe(1);
      expect(report.byCategory['identity']!.passed).toBe(1);
    });
  });

  describe('printReport', () => {
    it('does not throw', () => {
      const results: ScenarioResult[] = [
        {
          scenarioName: 'test',
          passed: true,
          category: 'dedup',
          details: 'ok',
          assertions: [{ label: 'check', expected: true, actual: true, pass: true }],
        },
      ];
      const report = scorer.scoreScenarioResults(results);
      expect(() => scorer.printReport(report)).not.toThrow();
    });
  });
});
