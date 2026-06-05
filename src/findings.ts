// src/findings.ts
import { REVIEWER_NAMES, SEVERITIES, FINDING_CATEGORIES, SSOT_DIRECTIONS } from './types.js';

const REVIEWERS = new Set<string>(REVIEWER_NAMES);
const LEVELS = new Set<string>(SEVERITIES);
const CATEGORIES = new Set<string>(FINDING_CATEGORIES);
const SSOT = new Set<string>(SSOT_DIRECTIONS);

export function validateReviewerOutput(input: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (typeof input !== 'object' || input === null) {
    return { valid: false, errors: ['root must be an object'] };
  }
  const o = input as Record<string, unknown>;
  if (!REVIEWERS.has(o.reviewer as string)) errors.push(`reviewer invalid: ${String(o.reviewer)}`);
  if (o.status !== 'ok' && o.status !== 'failed') errors.push('status must be "ok" or "failed"');

  if (!Array.isArray(o.findings)) {
    errors.push('findings must be an array');
    return { valid: false, errors };
  }

  const reqStr = (v: unknown) => typeof v === 'string' && v.length > 0;
  o.findings.forEach((raw, i) => {
    const at = `findings[${i}]`;
    const f = raw as Record<string, unknown>;
    if (typeof f !== 'object' || f === null) { errors.push(`${at} must be an object`); return; }
    if (!reqStr(f.file)) errors.push(`${at}.file required (non-empty string)`);
    if (!Array.isArray(f.related) || !f.related.every((x) => typeof x === 'string'))
      errors.push(`${at}.related must be an array of strings`);
    if (!REVIEWERS.has(f.reviewer as string)) errors.push(`${at}.reviewer invalid`);
    if (!CATEGORIES.has(f.category as string)) errors.push(`${at}.category invalid`);
    if (!reqStr(f.problem)) errors.push(`${at}.problem required`);
    if (typeof f.evidence !== 'string') errors.push(`${at}.evidence required`);
    if (typeof f.suggestion !== 'string') errors.push(`${at}.suggestion required`);
    if (!LEVELS.has(f.severity as string)) errors.push(`${at}.severity invalid`);
    if (!LEVELS.has(f.confidence as string)) errors.push(`${at}.confidence invalid`);
    if (!SSOT.has(f.ssot_direction as string)) errors.push(`${at}.ssot_direction invalid`);
  });

  if (o.status === 'failed' && o.findings.length > 0) {
    errors.push('failed status must carry empty findings');
  }
  return { valid: errors.length === 0, errors };
}
