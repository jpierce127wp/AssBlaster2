import { describe, it, expect } from 'vitest';
import { normalize, tokenize, cosineSimilarity, truncate } from '../../../src/lib/text/index.js';

describe('normalize', () => {
  it('lowercases text', () => {
    expect(normalize('Hello WORLD')).toBe('hello world');
  });

  it('collapses whitespace', () => {
    expect(normalize('hello   world\t\nfoo')).toBe('hello world foo');
  });

  it('strips diacritics', () => {
    expect(normalize('café résumé naïve')).toBe('cafe resume naive');
  });

  it('trims leading and trailing whitespace', () => {
    expect(normalize('  hello  ')).toBe('hello');
  });

  it('returns empty string for empty input', () => {
    expect(normalize('')).toBe('');
  });

  it('handles combined normalization', () => {
    expect(normalize('  Héllo   WÖRLD  ')).toBe('hello world');
  });
});

describe('tokenize', () => {
  it('splits on word boundaries', () => {
    expect(tokenize('hello world')).toEqual(['hello', 'world']);
  });

  it('filters punctuation-only tokens', () => {
    expect(tokenize('hello, world!')).toEqual(['hello', 'world']);
  });

  it('returns empty array for empty input', () => {
    expect(tokenize('')).toEqual([]);
  });

  it('handles multiple spaces between words', () => {
    expect(tokenize('one   two   three')).toEqual(['one', 'two', 'three']);
  });

  it('handles mixed punctuation and words', () => {
    const tokens = tokenize('File motion to compel (Johnson v. Smith)');
    expect(tokens).toContain('File');
    expect(tokens).toContain('motion');
    expect(tokens).toContain('Johnson');
    expect(tokens).toContain('Smith');
  });

  it('preserves numeric tokens', () => {
    expect(tokenize('case 42 section 7')).toEqual(['case', '42', 'section', '7']);
  });
});

describe('cosineSimilarity', () => {
  it('returns 1 for identical vectors', () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1.0);
  });

  it('returns 0 for orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0.0);
  });

  it('returns 0 for empty vectors', () => {
    expect(cosineSimilarity([], [])).toBe(0);
  });

  it('returns 0 for zero vectors', () => {
    expect(cosineSimilarity([0, 0, 0], [0, 0, 0])).toBe(0);
  });

  it('returns 0 for mismatched lengths', () => {
    expect(cosineSimilarity([1, 2], [1, 2, 3])).toBe(0);
  });

  it('computes known similarity', () => {
    // cos(45°) ≈ 0.707
    const a = [1, 0];
    const b = [1, 1];
    expect(cosineSimilarity(a, b)).toBeCloseTo(0.7071, 3);
  });

  it('handles negative components', () => {
    expect(cosineSimilarity([1, -1], [-1, 1])).toBeCloseTo(-1.0);
  });

  it('returns 0 when one vector is zero', () => {
    expect(cosineSimilarity([0, 0], [1, 2])).toBe(0);
  });
});

describe('truncate', () => {
  it('returns text unchanged when under limit', () => {
    expect(truncate('hello', 10)).toBe('hello');
  });

  it('returns text unchanged when exactly at limit', () => {
    expect(truncate('hello', 5)).toBe('hello');
  });

  it('truncates with ellipsis when over limit', () => {
    expect(truncate('hello world', 8)).toBe('hello...');
  });

  it('handles maxLen <= 3 without ellipsis', () => {
    expect(truncate('hello', 3)).toBe('hel');
    expect(truncate('hello', 2)).toBe('he');
    expect(truncate('hello', 1)).toBe('h');
  });

  it('handles maxLen of exactly 4', () => {
    expect(truncate('hello world', 4)).toBe('h...');
  });
});
