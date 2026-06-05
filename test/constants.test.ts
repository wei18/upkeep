// test/constants.test.ts
import { describe, it, expect } from 'vitest';
import {
  REVIEWER_NAMES, SEVERITIES, FINDING_CATEGORIES, SSOT_DIRECTIONS,
} from '../src/types.js';
import { defaultConfig } from '../src/config.js';
import { validateReviewerOutput } from '../src/findings.js';

describe('canonical constants are the single source of truth', () => {
  it('defaultConfig covers exactly the canonical reviewer names', () => {
    expect(Object.keys(defaultConfig().reviewers).sort()).toEqual([...REVIEWER_NAMES].sort());
  });

  it('validateReviewerOutput accepts every canonical reviewer name', () => {
    for (const reviewer of REVIEWER_NAMES) {
      expect(validateReviewerOutput({ reviewer, status: 'ok', findings: [] }).valid).toBe(true);
    }
  });

  it('validateReviewerOutput accepts every canonical severity/category/ssot value', () => {
    for (const severity of SEVERITIES) {
      for (const category of FINDING_CATEGORIES) {
        for (const ssot of SSOT_DIRECTIONS) {
          const out = validateReviewerOutput({
            reviewer: 'docs_staleness', status: 'ok',
            findings: [{
              file: 'a', related: [], reviewer: 'docs_staleness', category,
              problem: 'p', evidence: 'e', suggestion: 's',
              severity, confidence: severity, ssot_direction: ssot,
            }],
          });
          expect(out.valid).toBe(true);
        }
      }
    }
  });

  it('canonical sets have the expected sizes', () => {
    expect(REVIEWER_NAMES).toHaveLength(7);
    expect(SEVERITIES).toHaveLength(3);
    expect(FINDING_CATEGORIES).toHaveLength(7);
    expect(SSOT_DIRECTIONS).toHaveLength(4);
  });
});
