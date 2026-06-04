// test/classify.test.ts
import { describe, it, expect } from 'vitest';
import { classify } from '../src/classify.js';

const txt = (s: string) => Buffer.from(s, 'utf8');

describe('classify', () => {
  it('source code', () => {
    expect(classify('src/App.swift', txt('struct A {}')))
      .toEqual({ modality: 'text', category: 'code' });
  });
  it('markdown doc', () => {
    expect(classify('README.md', txt('# hi')).category).toBe('doc');
  });
  it('spec path', () => {
    expect(classify('docs/spec/flow.md', txt('x')).category).toBe('spec');
  });
  it('raster image is not byte-capped as text', () => {
    expect(classify('assets/logo.png', Buffer.from([0x89, 0x50, 0x4e, 0x47])))
      .toEqual({ modality: 'raster_image', category: 'visual' });
  });
  it('icon by name', () => {
    expect(classify('Assets.xcassets/AppIcon.appiconset/icon.png', txt('')).category)
      .toBe('icon');
  });
  it('vector diagram is text-modality', () => {
    expect(classify('docs/flow.mmd', txt('graph TD; A-->B')))
      .toEqual({ modality: 'vector_diagram', category: 'flow' });
  });
  it('binary content with NUL byte', () => {
    expect(classify('data.bin', Buffer.from([1, 0, 2])).modality).toBe('binary');
  });
});
