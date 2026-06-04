// src/synthesis.ts
const LEVELS = new Set(['low', 'medium', 'high']);

export function validateSynthesisOutput(input: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (typeof input !== 'object' || input === null) {
    return { valid: false, errors: ['root must be an object'] };
  }
  const o = input as Record<string, unknown>;

  if (o.status !== 'ok' && o.status !== 'failed') errors.push('status must be "ok" or "failed"');
  if (typeof o.executive_summary !== 'string') errors.push('executive_summary must be a string');

  if (!Array.isArray(o.themes)) {
    errors.push('themes must be an array');
  } else {
    o.themes.forEach((raw, i) => {
      const at = `themes[${i}]`;
      const t = raw as Record<string, unknown>;
      if (typeof t !== 'object' || t === null) { errors.push(`${at} must be an object`); return; }
      if (typeof t.title !== 'string' || t.title.length === 0) errors.push(`${at}.title required`);
      if (typeof t.narrative !== 'string') errors.push(`${at}.narrative required`);
      if (!Array.isArray(t.related_files) || !t.related_files.every((x) => typeof x === 'string')) {
        errors.push(`${at}.related_files must be an array of strings`);
      }
      if (!LEVELS.has(t.priority as string)) errors.push(`${at}.priority invalid`);
    });
  }

  if (!Array.isArray(o.semantic_duplicates)
    || !o.semantic_duplicates.every((g) => Array.isArray(g) && g.every((x) => typeof x === 'string'))) {
    errors.push('semantic_duplicates must be an array of string arrays');
  }

  if (o.status === 'failed' && Array.isArray(o.themes) && o.themes.length > 0) {
    errors.push('failed status must carry empty themes');
  }
  return { valid: errors.length === 0, errors };
}
