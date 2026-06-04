// test/synthesis.test.ts
import { describe, it, expect } from 'vitest';
import { validateSynthesisOutput } from '../src/synthesis.js';

const good = {
  themes: [
    { title: '文件與實作系統性漂移', narrative: '多處 README 與 code 不符，集中在近兩月大改的模組。', related_files: ['README.md', 'src/discovery.ts'], priority: 'high' },
  ],
  semantic_duplicates: [['docs_staleness|README.md|staleness', 'convention|README.md|convention']],
  executive_summary: '整體健康度尚可，主要風險是文件漂移。',
  status: 'ok',
};

describe('validateSynthesisOutput', () => {
  it('accepts a well-formed synthesis', () => {
    const r = validateSynthesisOutput(good);
    expect(r.errors).toEqual([]);
    expect(r.valid).toBe(true);
  });
  it('rejects non-object root', () => {
    expect(validateSynthesisOutput(null).valid).toBe(false);
  });
  it('rejects bad status', () => {
    expect(validateSynthesisOutput({ ...good, status: 'done' }).valid).toBe(false);
  });
  it('rejects non-string executive_summary', () => {
    expect(validateSynthesisOutput({ ...good, executive_summary: 5 }).valid).toBe(false);
  });
  it('rejects theme with invalid priority', () => {
    const bad = { ...good, themes: [{ ...good.themes[0], priority: 'urgent' }] };
    const r = validateSynthesisOutput(bad);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes('priority'))).toBe(true);
  });
  it('rejects related_files containing a non-string', () => {
    const bad = { ...good, themes: [{ ...good.themes[0], related_files: ['ok', 7] }] };
    expect(validateSynthesisOutput(bad).valid).toBe(false);
  });
  it('rejects semantic_duplicates that is not array of string arrays', () => {
    expect(validateSynthesisOutput({ ...good, semantic_duplicates: ['x'] }).valid).toBe(false);
  });
  it('rejects failed status carrying themes', () => {
    const r = validateSynthesisOutput({ ...good, status: 'failed' });
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes('failed'))).toBe(true);
  });
  it('accepts failed status with empty themes', () => {
    expect(validateSynthesisOutput({ themes: [], semantic_duplicates: [], executive_summary: '', status: 'failed' }).valid).toBe(true);
  });
});
