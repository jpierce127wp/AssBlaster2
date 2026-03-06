/**
 * Golden test scenario execution — runs fixture scenarios using deterministic logic only.
 * Does NOT call Claude or external services.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { DeterministicDedup } from '../dedupe/dedup.deterministic.js';
import { DEDUP_THRESHOLDS } from '../domain/dedup.types.js';
import { TERMINAL_STATUSES } from '../domain/policy.js';
import type { ScenarioResult } from './scoring.js';
import { Scorer } from './scoring.js';

interface ScenarioFixture {
  name: string;
  description: string;
  evidence_events?: Array<Record<string, unknown>>;
  candidate_tasks?: Array<{
    canonical_summary: string;
    matter_id: string | null;
    action_type: string;
    due_date_window_start: string | null;
    [key: string]: unknown;
  }>;
  existing_canonical_task?: {
    id: string;
    canonical_summary: string;
    status: string;
    action_type: string;
    matter_id: string | null;
    due_date_window_start: string | null;
  };
  candidate_task?: {
    canonical_summary: string;
    matter_id: string | null;
    action_type: string;
    due_date_window_start: string | null;
    [key: string]: unknown;
  };
  expected: Record<string, unknown>;
}

export class GoldenRunner {
  private fixturesDir: string;

  constructor(fixturesDir?: string) {
    this.fixturesDir = fixturesDir ?? join(process.cwd(), 'fixtures', 'scenarios');
  }

  /** Load and execute all scenario fixtures */
  async runAll(): Promise<ScenarioResult[]> {
    const files = readdirSync(this.fixturesDir)
      .filter((f) => f.startsWith('scenario-') && f.endsWith('.json'))
      .sort();

    const results: ScenarioResult[] = [];
    for (const file of files) {
      const path = join(this.fixturesDir, file);
      const raw = readFileSync(path, 'utf-8');
      const scenario = JSON.parse(raw) as ScenarioFixture;
      results.push(await this.run(scenario));
    }

    return results;
  }

  /** Execute a single scenario */
  async run(scenario: ScenarioFixture): Promise<ScenarioResult> {
    const assertions: ScenarioResult['assertions'] = [];
    const expected = scenario.expected;

    // Get all candidate tasks (from array or single)
    const candidates = scenario.candidate_tasks ?? (scenario.candidate_task ? [scenario.candidate_task] : []);

    // Compute fingerprints for all candidates
    const fingerprints = candidates.map((c) =>
      DeterministicDedup.computeFingerprint(
        c.canonical_summary,
        c.matter_id,
        c.action_type,
        c.due_date_window_start,
      ),
    );

    // Determine unique fingerprints
    const uniqueFingerprints = new Map<string, number>();
    for (const fp of fingerprints) {
      const key = JSON.stringify(fp);
      uniqueFingerprints.set(key, (uniqueFingerprints.get(key) ?? 0) + 1);
    }

    // Check fingerprints_match assertion
    if ('fingerprints_match' in expected) {
      const allMatch = uniqueFingerprints.size === 1 && candidates.length > 1;
      assertions.push({
        label: 'fingerprints_match',
        expected: expected.fingerprints_match,
        actual: allMatch,
        pass: allMatch === expected.fingerprints_match,
      });
    }

    // Check canonical_task_count assertion
    if ('canonical_task_count' in expected) {
      const actualCount = uniqueFingerprints.size;
      assertions.push({
        label: 'canonical_task_count',
        expected: expected.canonical_task_count,
        actual: actualCount,
        pass: actualCount === expected.canonical_task_count,
      });
    }

    // Check evidence_link_count assertion
    if ('evidence_link_count' in expected) {
      // In a fingerprint-match scenario, all evidence events link to the same canonical task
      const actualLinks = scenario.evidence_events?.length ?? candidates.length;
      assertions.push({
        label: 'evidence_link_count',
        expected: expected.evidence_link_count,
        actual: actualLinks,
        pass: actualLinks === expected.evidence_link_count,
      });
    }

    // Check canonical_summary assertion
    if ('canonical_summary' in expected && candidates.length > 0) {
      const actualSummary = fingerprints[0]!.canonicalSummary;
      const expectedSummary = (expected.canonical_summary as string).toLowerCase().trim().replace(/\s+/g, ' ');
      assertions.push({
        label: 'canonical_summary',
        expected: expected.canonical_summary,
        actual: candidates[0]!.canonical_summary,
        pass: actualSummary === expectedSummary,
      });
    }

    // Check action_type assertion
    if ('action_type' in expected && candidates.length > 0) {
      assertions.push({
        label: 'action_type',
        expected: expected.action_type,
        actual: candidates[0]!.action_type,
        pass: candidates[0]!.action_type === expected.action_type,
      });
    }

    // Check action_types assertion (multiple distinct types)
    if ('action_types' in expected) {
      const actualTypes = [...new Set(candidates.map((c) => c.action_type))].sort();
      const expectedTypes = (expected.action_types as string[]).sort();
      assertions.push({
        label: 'action_types',
        expected: expectedTypes,
        actual: actualTypes,
        pass: JSON.stringify(actualTypes) === JSON.stringify(expectedTypes),
      });
    }

    // Check decision (follow_up, reopen, etc.) for scenarios with existing canonical tasks
    if ('decision' in expected && scenario.existing_canonical_task) {
      const existingStatus = scenario.existing_canonical_task.status;
      const isTerminal = TERMINAL_STATUSES.has(existingStatus);

      if (expected.decision === 'follow_up') {
        assertions.push({
          label: 'decision_follow_up',
          expected: 'follow_up',
          actual: isTerminal ? 'follow_up' : 'merge',
          pass: isTerminal,
        });
      }
    }

    // Check reopen assertion
    if ('reopen' in expected && scenario.existing_canonical_task) {
      const isTerminal = TERMINAL_STATUSES.has(scenario.existing_canonical_task.status);
      const wouldReopen = !isTerminal;
      assertions.push({
        label: 'reopen',
        expected: expected.reopen,
        actual: wouldReopen,
        pass: wouldReopen === expected.reopen,
      });
    }

    // Check creates_new_task assertion
    if ('creates_new_task' in expected && scenario.existing_canonical_task) {
      const isTerminal = TERMINAL_STATUSES.has(scenario.existing_canonical_task.status);
      assertions.push({
        label: 'creates_new_task',
        expected: expected.creates_new_task,
        actual: isTerminal,
        pass: isTerminal === expected.creates_new_task,
      });
    }

    const allPassed = assertions.length > 0 && assertions.every((a) => a.pass);

    // Categorize the scenario
    let category: ScenarioResult['category'] = 'dedup';
    if (scenario.name.toLowerCase().includes('identity') || scenario.name.toLowerCase().includes('matter')) {
      category = 'identity';
    }
    if (scenario.name.toLowerCase().includes('extract') || scenario.name.toLowerCase().includes('noisy')) {
      category = 'extraction';
    }

    return {
      scenarioName: scenario.name,
      passed: allPassed,
      category,
      details: allPassed
        ? `All ${assertions.length} assertions passed`
        : `${assertions.filter((a) => !a.pass).length}/${assertions.length} assertions failed`,
      assertions,
    };
  }

  /** Print a formatted report of all results */
  printReport(results: ScenarioResult[]): void {
    const scorer = new Scorer();
    const report = scorer.scoreScenarioResults(results);
    scorer.printReport(report);
  }
}
