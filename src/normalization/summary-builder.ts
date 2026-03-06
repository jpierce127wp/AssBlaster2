/**
 * Summary post-processor that validates and normalizes canonical summaries.
 */

const MAX_SUMMARY_LENGTH = 80;

/** Common imperative verbs that a task summary should start with */
const IMPERATIVE_VERBS = new Set([
  'file', 'draft', 'prepare', 'review', 'schedule', 'send', 'complete',
  'submit', 'research', 'respond', 'coordinate', 'contact', 'follow',
  'update', 'create', 'revise', 'finalize', 'obtain', 'request',
  'arrange', 'analyze', 'compile', 'serve', 'depose', 'negotiate',
  'produce', 'organize', 'verify', 'confirm', 'issue', 'notify',
  'calculate', 'investigate', 'outline', 'summarize',
  'track', 'document', 'distribute', 'execute', 'process',
]);

/** PII patterns to detect in summaries */
const PII_PATTERNS = [
  /\b\d{3}-\d{2}-\d{4}\b/,       // SSN
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/, // Email
  /\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/, // Credit card
  /\b\d{10,11}\b/,                 // Phone number (10-11 digits)
];

export class SummaryBuilder {
  /** Enforce style rules on a summary */
  refine(summary: string): string {
    let result = summary;

    // Normalize whitespace
    result = result.replace(/\s+/g, ' ').trim();

    // Remove trailing periods
    result = result.replace(/\.+$/, '');

    // Trim to max length
    if (result.length > MAX_SUMMARY_LENGTH) {
      result = result.slice(0, MAX_SUMMARY_LENGTH).trim();
      // Cut at word boundary when possible
      const lastSpace = result.lastIndexOf(' ');
      if (lastSpace > MAX_SUMMARY_LENGTH * 0.6) {
        result = result.slice(0, lastSpace);
      }
    }

    return result;
  }

  /** Validate summary quality */
  validate(summary: string): { valid: boolean; issues: string[] } {
    const issues: string[] = [];

    if (!summary || summary.trim().length === 0) {
      issues.push('Summary is empty');
      return { valid: false, issues };
    }

    const trimmed = summary.trim();

    if (trimmed.length > MAX_SUMMARY_LENGTH) {
      issues.push(`Summary exceeds ${MAX_SUMMARY_LENGTH} characters (${trimmed.length})`);
    }

    const words = trimmed.split(/\s+/);
    if (words.length < 2) {
      issues.push('Summary must contain at least a verb and object');
    }

    const firstWord = words[0]!.toLowerCase();
    if (!IMPERATIVE_VERBS.has(firstWord)) {
      issues.push(`Summary should start with an imperative verb (found: "${words[0]}")`);
    }

    for (const pattern of PII_PATTERNS) {
      if (pattern.test(trimmed)) {
        issues.push('Summary may contain PII (SSN, email, credit card, or phone number)');
        break;
      }
    }

    return { valid: issues.length === 0, issues };
  }
}
