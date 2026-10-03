import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { stringify } from 'yaml';
import { runCli, USAGE, type ContentBundle } from '../src/index';
import { baseContent, TODAY } from './helpers';

let dir: string;
let lines: string[];
let errors: string[];
const io = () => ({
  today: TODAY,
  log: (l: string) => lines.push(l),
  error: (l: string) => errors.push(l),
});

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'bk-content-'));
  lines = [];
  errors = [];
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const writeContent = (content: object) =>
  writeFileSync(join(dir, 'content.yaml'), stringify(content));

describe('runCli', () => {
  it('checks content and exits 0 when there are no errors', () => {
    writeContent(baseContent());
    expect(runCli(['check', dir], io())).toBe(0);
    expect(lines[0]).toMatch(/^Checked \(dev\): 1 sport\(s\), 1 unit\(s\), 1 lesson\(s\)/);
    expect(lines.at(-1)).toMatch(/^OK: 0 errors/);
  });

  it('exits 1 and lists errors when content is invalid', () => {
    writeContent({ ...baseContent(), units: [] });
    expect(runCli(['check', dir], io())).toBe(1);
    expect(lines.some((l) => l.startsWith('  ERROR'))).toBe(true);
    expect(lines.at(-1)).toMatch(/^FAILED: /);
  });

  it('builds a bundle into --out', () => {
    writeContent(baseContent());
    const out = join(dir, 'out');
    expect(runCli(['build', dir, '--out', out], io())).toBe(0);
    const bundle = JSON.parse(readFileSync(join(out, 'content.json'), 'utf8')) as ContentBundle;
    expect(bundle).toMatchObject({ mode: 'dev', builtOn: TODAY });
    expect(bundle.items).toHaveLength(2);
  });

  it('refuses a ship build of fixture or unreviewed content', () => {
    writeContent(baseContent());
    expect(runCli(['build', dir, '--ship', '--out', join(dir, 'out')], io())).toBe(1);
    expect(lines.some((l) => l.includes('Fixture data can never ship'))).toBe(true);
  });

  it('reports present-track freshness', () => {
    const content = baseContent();
    content.units[0]!.track = 'present';
    content.units[0]!.kind = 'team';
    for (const item of content.items) item.track = 'present';
    content.items[1]!.lastVerifiedAt = TODAY; // the other was verified long ago
    writeContent(content);
    expect(runCli(['check', dir], io())).toBe(0);
    expect(lines).toContain('Freshness: 2 present-track item(s), 1 stale');
  });

  it('rejects unknown flags instead of silently building in dev mode', () => {
    writeContent(baseContent());
    for (const flag of ['--Ship', '--ship=true', '-s']) {
      expect(runCli(['build', dir, flag, '--out', join(dir, 'out')], io())).toBe(2);
      expect(errors.at(-1)).toContain(`Unknown option(s): ${flag}`);
    }
    expect(lines).toEqual([]);
  });

  it('exits 2 with a clear message when the content directory is missing', () => {
    expect(runCli(['check', join(dir, 'nope')], io())).toBe(2);
    expect(errors).toEqual([`Content directory not found: ${join(dir, 'nope')}`]);
  });

  it('exits 2 on bad usage', () => {
    expect(runCli(['publish'], io())).toBe(2);
    expect(errors).toEqual([USAGE]);
    expect(runCli(['build', dir, '--out'], io())).toBe(2);
    expect(errors.at(-1)).toBe('--out needs a directory');
  });
});
