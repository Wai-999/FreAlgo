import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/** WCAG 2.x relative luminance / contrast ratio. */
function luminance(hex: string): number {
  const n = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255);
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r!) + 0.7152 * lin(g!) + 0.0722 * lin(b!);
}
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

const css = readFileSync('app/globals.css', 'utf8');
const token = (name: string) => {
  const m = css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (!m) throw new Error(`token --${name} not found`);
  return m[1]!;
};

describe('design tokens', () => {
  it('match the specified palette', () => {
    expect(token('bg').toLowerCase()).toBe('#000000');
    expect(token('surface').toLowerCase()).toBe('#090d16');
    expect(token('surface-raised').toLowerCase()).toBe('#101827');
    expect(token('text').toLowerCase()).toBe('#f8fafc');
    expect(token('muted').toLowerCase()).toBe('#a6b2c3');
    expect(token('accent').toLowerCase()).toBe('#1d9bff');
    expect(token('accent-hover').toLowerCase()).toBe('#65beff');
    expect(token('border').toLowerCase()).toBe('#233044');
    expect(token('focus').toLowerCase()).toBe('#8cd1ff');
    expect(token('danger').toLowerCase()).toBe('#ff6b75');
  });

  const backgrounds = ['bg', 'surface', 'surface-raised'];

  it.each(['text', 'muted', 'accent-hover', 'danger', 'focus', 'warning', 'success'])(
    '%s text meets AA 4.5:1 on every surface',
    (fg) => {
      for (const bg of backgrounds)
        expect(contrast(token(fg), token(bg))).toBeGreaterThanOrEqual(4.5);
    },
  );

  it('accent meets AA for text on the page background and large text on surfaces', () => {
    expect(contrast(token('accent'), token('bg'))).toBeGreaterThanOrEqual(4.5);
    for (const bg of backgrounds)
      expect(contrast(token('accent'), token(bg))).toBeGreaterThanOrEqual(3);
  });

  it('component boundaries (inputs, focus ring) meet 3:1', () => {
    for (const bg of backgrounds) {
      expect(contrast(token('border-strong'), token(bg))).toBeGreaterThanOrEqual(3);
      expect(contrast(token('focus'), token(bg))).toBeGreaterThanOrEqual(3);
    }
  });

  it('documents that --border is decorative only (fails 3:1 by design)', () => {
    expect(contrast(token('border'), token('bg'))).toBeLessThan(3);
  });
});
