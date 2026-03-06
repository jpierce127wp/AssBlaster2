/**
 * Evaluation metrics: precision, recall, F1, and scenario-level scoring.
 */

export interface ScenarioResult {
  scenarioName: string;
  passed: boolean;
  category: 'dedup' | 'extraction' | 'identity';
  details: string;
  assertions: Array<{ label: string; expected: unknown; actual: unknown; pass: boolean }>;
}

export interface CategoryMetrics {
  total: number;
  passed: number;
  failed: number;
  accuracy: number;
  precision: number;
  recall: number;
  f1: number;
}

export interface EvalReport {
  overall: CategoryMetrics;
  byCategory: Record<string, CategoryMetrics>;
  scenarioResults: ScenarioResult[];
}

export class Scorer {
  precision(tp: number, fp: number): number {
    if (tp + fp === 0) return 0;
    return tp / (tp + fp);
  }

  recall(tp: number, fn: number): number {
    if (tp + fn === 0) return 0;
    return tp / (tp + fn);
  }

  f1(precision: number, recall: number): number {
    if (precision + recall === 0) return 0;
    return (2 * precision * recall) / (precision + recall);
  }

  scoreScenarioResults(results: ScenarioResult[]): EvalReport {
    const byCategory: Record<string, CategoryMetrics> = {};

    for (const result of results) {
      if (!byCategory[result.category]) {
        byCategory[result.category] = { total: 0, passed: 0, failed: 0, accuracy: 0, precision: 0, recall: 0, f1: 0 };
      }
      const cat = byCategory[result.category]!;
      cat.total++;
      if (result.passed) cat.passed++;
      else cat.failed++;
    }

    for (const cat of Object.values(byCategory)) {
      cat.accuracy = cat.total > 0 ? cat.passed / cat.total : 0;
      const tp = cat.passed;
      const fp = cat.failed;
      cat.precision = this.precision(tp, fp);
      cat.recall = this.recall(tp, 0);
      cat.f1 = this.f1(cat.precision, cat.recall);
    }

    const totalPassed = results.filter((r) => r.passed).length;
    const totalFailed = results.filter((r) => !r.passed).length;
    const overallPrecision = this.precision(totalPassed, totalFailed);
    const overallRecall = this.recall(totalPassed, 0);
    const overall: CategoryMetrics = {
      total: results.length,
      passed: totalPassed,
      failed: totalFailed,
      accuracy: results.length > 0 ? totalPassed / results.length : 0,
      precision: overallPrecision,
      recall: overallRecall,
      f1: this.f1(overallPrecision, overallRecall),
    };

    return { overall, byCategory, scenarioResults: results };
  }

  printReport(report: EvalReport): void {
    console.log('\n=== Evaluation Report ===\n');
    console.log(`Overall: ${report.overall.passed}/${report.overall.total} passed (${(report.overall.accuracy * 100).toFixed(1)}%)`);
    console.log(`  Precision: ${(report.overall.precision * 100).toFixed(1)}%`);
    console.log(`  Recall:    ${(report.overall.recall * 100).toFixed(1)}%`);
    console.log(`  F1:        ${(report.overall.f1 * 100).toFixed(1)}%`);

    for (const [category, metrics] of Object.entries(report.byCategory)) {
      console.log(`\n  [${category}] ${metrics.passed}/${metrics.total} (${(metrics.accuracy * 100).toFixed(1)}%)`);
    }

    console.log('\n--- Scenario Details ---');
    for (const result of report.scenarioResults) {
      const status = result.passed ? 'PASS' : 'FAIL';
      console.log(`  [${status}] ${result.scenarioName}: ${result.details}`);
      for (const a of result.assertions) {
        const aStatus = a.pass ? 'ok' : 'FAIL';
        console.log(`    ${aStatus}: ${a.label} (expected=${JSON.stringify(a.expected)}, actual=${JSON.stringify(a.actual)})`);
      }
    }
    console.log('');
  }
}
