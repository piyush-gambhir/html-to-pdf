import { describe, expect, it } from 'vitest';
import { resolveChromiumPath } from '../../core/pdf.js';

describe('html-to-pdf core', () => {
  it('resolveChromiumPath returns null or a string', () => {
    const p = resolveChromiumPath();
    expect(p === null || typeof p === 'string').toBe(true);
  });
});
