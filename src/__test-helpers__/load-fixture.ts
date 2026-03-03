import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Load a JSON fixture from the golden/ directory.
 * @param relativePath - path relative to golden/ (e.g. 'scenarios/scenario-a.json')
 */
export function loadFixture<T>(relativePath: string): T {
  const fullPath = resolve(__dirname, '..', '..', 'golden', relativePath);
  const raw = readFileSync(fullPath, 'utf-8');
  return JSON.parse(raw) as T;
}
