// test/matrix.test.ts
import { describe, it, expect } from 'vitest';
import { enabledReviewers } from '../src/matrix.js';
import { defaultConfig } from '../src/config.js';

describe('enabledReviewers', () => {
  it('returns the 6 default-on reviewers (no i18n)', () => {
    expect(enabledReviewers(defaultConfig()).sort()).toEqual(
      ['code_hygiene', 'convention', 'docs_staleness', 'duplicate_orphan', 'spec_flow', 'visual_icon'],
    );
  });
  it('includes i18n when enabled', () => {
    const c = defaultConfig(); c.reviewers.i18n.enabled = true;
    expect(enabledReviewers(c)).toContain('i18n');
  });
  it('excludes a disabled reviewer', () => {
    const c = defaultConfig(); c.reviewers.visual_icon.enabled = false;
    expect(enabledReviewers(c)).not.toContain('visual_icon');
  });
});
