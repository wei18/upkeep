// test/synthesis-assets.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

describe('synthesis prompt asset', () => {
  it('states it reads all findings + inventory and writes synthesis.json', () => {
    const text = readFileSync(join(ROOT, 'reviewers/en/_synthesis-prompt.md'), 'utf8');
    expect(text).toContain('synthesis.json');
    expect(text).toMatch(/findings/);
    expect(text).toMatch(/related_files/);
    expect(text).toMatch(/executive_summary/);
    expect(text).toMatch(/semantic_duplicates/);
  });
});
