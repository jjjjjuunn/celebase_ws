// WCAG 2.1 contrast verification for CelebBase tokens.
// DESIGN.md §2.9: all text pairs ≥ 4.5:1, graphics ≥ 3:1.
// Invoked ad-hoc; not in CI yet (integration pending IMPL-UI-002).

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = join(__dirname, '..');
const SOURCE_CSS = join(PACKAGE_ROOT, 'tokens.css');

type Theme = 'light' | 'dark';

interface Pair {
  label: string;
  fg: string;
  bg: string;
  min: number;
}

interface Result extends Pair {
  theme: Theme;
  ratio: number;
  status: 'pass' | 'fail';
}

function parseBlock(css: string, selector: string): Record<string, string> {
  const selectorIdx = css.indexOf(selector);
  if (selectorIdx === -1) {
    throw new Error(`Selector "${selector}" not found`);
  }
  const openBrace = css.indexOf('{', selectorIdx);
  const closeBrace = css.indexOf('}', openBrace);
  const body = css.slice(openBrace + 1, closeBrace);
  const map: Record<string, string> = {};
  for (const rawLine of body.split('\n')) {
    const line = rawLine.replace(/\/\*.*?\*\//g, '').trim();
    if (!line.startsWith('--')) continue;
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const name = line.slice(0, colonIdx).trim();
    const value = line.slice(colonIdx + 1).replace(/;$/, '').trim();
    map[name] = value;
  }
  return map;
}

function resolveVar(
  raw: string,
  map: Record<string, string>,
  seen: Set<string> = new Set(),
): string {
  const match = raw.match(/^var\((--[a-z0-9-]+)\)$/i);
  const name = match?.[1];
  if (!name) return raw;
  if (seen.has(name)) throw new Error(`Cyclic var: ${name}`);
  seen.add(name);
  const next = map[name];
  if (!next) throw new Error(`Unknown token: ${name}`);
  return resolveVar(next, map, seen);
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function channelLum(c8: number): number {
  const c = c8 / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function luminance([r, g, b]: [number, number, number]): number {
  return 0.2126 * channelLum(r) + 0.7152 * channelLum(g) + 0.0722 * channelLum(b);
}

function contrastRatio(fg: string, bg: string): number {
  const L1 = luminance(hexToRgb(fg));
  const L2 = luminance(hexToRgb(bg));
  const [lighter, darker] = L1 > L2 ? [L1, L2] : [L2, L1];
  return (lighter + 0.05) / (darker + 0.05);
}

const PAIRS: Pair[] = [
  // Text pairs (≥ 4.5:1)
  { label: 'text on bg', fg: 'var(--cb-color-text)', bg: 'var(--cb-color-bg)', min: 4.5 },
  { label: 'text on surface', fg: 'var(--cb-color-text)', bg: 'var(--cb-color-surface)', min: 4.5 },
  { label: 'muted on bg', fg: 'var(--cb-color-text-muted)', bg: 'var(--cb-color-bg)', min: 4.5 },
  { label: 'brand on bg', fg: 'var(--cb-color-brand)', bg: 'var(--cb-color-bg)', min: 4.5 },
  { label: 'cta-text on brand-600', fg: 'var(--cb-cta-text)', bg: 'var(--cb-brand-600)', min: 4.5 },
  { label: 'danger-600 on bg', fg: 'var(--cb-danger-600)', bg: 'var(--cb-color-bg)', min: 4.5 },
  { label: 'success-600 on bg', fg: 'var(--cb-success-600)', bg: 'var(--cb-color-bg)', min: 4.5 },
  { label: 'warning-600 on bg', fg: 'var(--cb-warning-600)', bg: 'var(--cb-color-bg)', min: 4.5 },
  { label: 'info-600 on bg', fg: 'var(--cb-info-600)', bg: 'var(--cb-color-bg)', min: 4.5 },
  // Border/graphics pairs (≥ 3:1)
  { label: 'border-strong on bg', fg: 'var(--cb-border-strong)', bg: 'var(--cb-color-bg)', min: 3.0 },
  { label: 'border-focus on bg', fg: 'var(--cb-border-focus)', bg: 'var(--cb-color-bg)', min: 3.0 },
  { label: 'border-error on bg', fg: 'var(--cb-border-error)', bg: 'var(--cb-color-bg)', min: 3.0 },
];

function evalTheme(theme: Theme, light: Record<string, string>, dark: Record<string, string>): Result[] {
  const map = theme === 'light' ? light : { ...light, ...dark };
  return PAIRS.map((pair) => {
    const fg = resolveVar(pair.fg, map);
    const bg = resolveVar(pair.bg, map);
    const ratio = contrastRatio(fg, bg);
    return {
      ...pair,
      theme,
      ratio,
      status: ratio >= pair.min ? 'pass' : 'fail',
    };
  });
}

function main(): void {
  const css = readFileSync(SOURCE_CSS, 'utf8');
  const light = parseBlock(css, ':root');
  const dark = parseBlock(css, "[data-theme='dark']");

  const results = [...evalTheme('light', light, dark), ...evalTheme('dark', light, dark)];

  const header = ['theme', 'label', 'ratio', 'min', 'status'].join('\t');
  process.stdout.write(header + '\n');
  for (const r of results) {
    process.stdout.write(
      [r.theme, r.label, r.ratio.toFixed(2), r.min.toFixed(1), r.status].join('\t') + '\n',
    );
  }

  const failures = results.filter((r) => r.status === 'fail');
  if (failures.length > 0) {
    process.stderr.write(`\n${String(failures.length)} contrast failure(s).\n`);
    process.exit(1);
  }
  process.stdout.write(`\nAll ${String(results.length)} pairs pass.\n`);
}

main();
