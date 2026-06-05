// src/prompt-bundle.ts
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { composeRubric } from './rubric.js';
import type { Inventory, ReviewerName } from './types.js';

export function buildReviewerPrompt(
  reviewer: ReviewerName,
  inventory: Inventory,
  actionRoot: string,
  rubricLang = 'en',
): string {
  const bundle = composeRubric(reviewer, inventory, actionRoot, rubricLang);
  const template = readFileSync(join(actionRoot, 'reviewers', rubricLang, '_reviewer-prompt.md'), 'utf8')
    .replaceAll('{{REVIEWER}}', reviewer);
  const builtin = readFileSync(bundle.builtinRubric, 'utf8');

  const parts = [
    template,
    '\n\n## Your built-in rubric\n',
    builtin,
    '\n\n## Repo convention sources (read these; they override the built-in rubric on conflict)\n',
    bundle.conventionSources.length ? bundle.conventionSources.map((p) => `- ${p}`).join('\n') : '(none)',
  ];
  if (bundle.explicitRubric) {
    parts.push('\n\n## audit.yml override rubric (highest priority, read it)\n', `- ${bundle.explicitRubric}`);
  }
  parts.push(
    '\n\n## Your target files (review ONLY these)\n',
    bundle.targetFiles.length ? bundle.targetFiles.map((p) => `- ${p}`).join('\n') : '(none; output status:"ok", findings:[])',
  );
  return parts.join('');
}

export function buildSynthesisPrompt(actionRoot: string, rubricLang = 'en'): string {
  return readFileSync(join(actionRoot, 'reviewers', rubricLang, '_synthesis-prompt.md'), 'utf8');
}

// CLI: prompt-bundle.ts <reviewer> <inventoryJson> <outFile> [rubricLang=en]
if (import.meta.url === `file://${process.argv[1]}`) {
  const [reviewer, invPath, outFile, rubricLang] = process.argv.slice(2);
  const inventory = JSON.parse(readFileSync(invPath, 'utf8')) as Inventory;
  const actionRoot = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');
  writeFileSync(outFile, buildReviewerPrompt(reviewer as ReviewerName, inventory, actionRoot, rubricLang || 'en'));
}
