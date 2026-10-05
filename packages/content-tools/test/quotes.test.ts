import { KnowledgeItemSchema } from '@ball-knowledge/core';
import { FIXTURE_SOURCE, itemInput } from '@ball-knowledge/core/testing';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { stringify } from 'yaml';
import {
  decodeEntities,
  missingFragment,
  pageText,
  quoteKey,
  runVerifyQuotes,
  VERIFY_USAGE,
  verifyQuotes,
} from '../src/index';
import { baseContent, TODAY } from './helpers';

const PAGE = `<html><head><style>.x { content: "Hidden style"; }</style>
<script>self.__next_f.push([1,"[\\"$\\",\\"p\\",\\"p-1\\",{\\"className\\":\\"rule\\",\\"children\\":\\"The fictional ball is round and bl"])</script>
<script>self.__next_f.push([1,"ue.\\"}],[\\"$\\",\\"li\\",\\"li-1\\",{\\"children\\":\\"first fictional item; or\\"}],[\\"$\\",\\"li\\",\\"li-2\\",{\\"children\\":\\"second fictional item.\\"}]"])</script>
<script type="application/ld+json">{"@type":"Article","headline":"Fixture League\\u2019s history"}</script>
<script>self.__next_f.push([1,"[\\"$\\",\\"div\\",null,{\\"dangerouslySetInnerHTML\\":{\\"__html\\":\\"<p>The <a href=\\\\\\"/teams/x\\\\\\">Testville Testers</a> won.</p>\\"}}]"])</script>
</head><body><!-- a comment that is not text -->
<h1>Fixture League &amp; friends</h1><p>It&rsquo;s a &ldquo;fictional&rdquo; page &#8212; 12&nbsp;teams.</p>
</body></html>`;

const item = (quote: string | undefined, url = FIXTURE_SOURCE.url) =>
  KnowledgeItemSchema.parse(
    itemInput({ sources: [{ ...FIXTURE_SOURCE, url, locator: 'Fixture page 1', quote }] }),
  );

describe('pageText', () => {
  const text = pageText(PAGE);

  it('reads the rendered HTML, decoding entities and dropping tags, styles, and comments', () => {
    expect(text).toContain('Fixture League & friends');
    expect(text).toContain('It’s a “fictional” page — 12 teams.');
    expect(text).not.toContain('Hidden style');
    expect(text).not.toContain('a comment');
  });

  it('reads text a framework streams as data, even when a chunk splits a word', () => {
    expect(quoteKey(text)).toContain(quoteKey('The fictional ball is round and blue.'));
    expect(text).toContain('Fixture League’s history');
  });

  it('strips markup inside embedded rich text, so linked names still match', () => {
    expect(quoteKey(text)).toContain(quoteKey('The Testville Testers won.'));
    expect(text).not.toContain('href');
  });

  it('skips structure (element names, React keys, class names) between text strings', () => {
    expect(text).not.toMatch(/\b(li-1|rule|className|children)\b/);
    expect(quoteKey(text)).toContain(quoteKey('first fictional item; or second fictional item.'));
  });
});

describe('pageText on raw Flight rows', () => {
  // A long rich-text row ships unquoted with its UTF-8 byte length in hex.
  const row = '<p>A "fictional" row – über long.</p>';
  const flight =
    `0:["$","p",null,{"children":"$$34.6M fictional cap"}]\n` +
    `5:T${Buffer.byteLength(row).toString(16)},${row}` +
    `6:["$","p",null,{"children":"After the row."}]\n`;
  const text = pageText(`<script>self.__next_f.push([1,${JSON.stringify(flight)}])</script>`);

  it('reads text rows by byte length and keeps reading the stream after them', () => {
    expect(text).toContain('A "fictional" row – über long.');
    expect(text).toContain('After the row.');
  });

  it('keeps literal text that starts with "$" (escaped as "$$")', () => {
    expect(text).toContain('$34.6M fictional cap');
    expect(text).not.toContain('$$');
  });
});

describe('decodeEntities', () => {
  it('decodes named, decimal, and hex entities and leaves unknown ones alone', () => {
    expect(decodeEntities('&amp; &#39; &#x2019; &frac13; &bogus; &#0;')).toBe(
      "& ' ’ ⅓ &bogus; &#0;",
    );
  });
});

describe('quoteKey and missingFragment', () => {
  const page = quoteKey(pageText(PAGE));

  it('ignores typography but not wording', () => {
    expect(quoteKey('It’s  a “fictional”\npage – 12')).toBe(
      quoteKey('It\'s a "fictional" page - 12'),
    );
    expect(missingFragment(page, 'It\'s a "fictional" page - 12 teams.')).toBeUndefined();
    expect(missingFragment(page, 'It’s a fictional page — 13 teams.')).toBe(
      'It’s a fictional page — 13 teams.',
    );
  });

  it('accepts … elisions only when the fragments appear in order', () => {
    expect(missingFragment(page, 'Fixture League … 12 teams.')).toBeUndefined();
    expect(missingFragment(page, '12 teams. … Fixture League & friends')).toBe(
      'Fixture League & friends',
    );
  });
});

describe('missingFragment edge cases', () => {
  it('never matches inside a longer number', () => {
    const page = quoteKey('The fictional club won 13 titles. Article 2 15 yards out.');
    expect(missingFragment(page, '3 titles')).toBe('3 titles');
    expect(missingFragment(page, '13 titles')).toBeUndefined();
    expect(missingFragment(page, '15 yards')).toBeUndefined();
    expect(missingFragment(page, 'Article 21')).toBe('Article 21');
  });

  it('keeps elided fragments near each other and accepts "..." as an elision', () => {
    const near = quoteKey(`Fixture start. ${'filler '.repeat(10)} Fixture end.`);
    const far = quoteKey(`Fixture start. ${'filler '.repeat(400)} Fixture end.`);
    expect(missingFragment(near, 'Fixture start. … Fixture end.')).toBeUndefined();
    expect(missingFragment(near, 'Fixture start. ... Fixture end.')).toBeUndefined();
    expect(missingFragment(far, 'Fixture start. … Fixture end.')).toBe('Fixture end.');
  });

  it('tries later occurrences of a fragment when an earlier one leads nowhere', () => {
    const page = quoteKey(`Fixture start. ${'filler '.repeat(400)} Fixture start. Fixture end.`);
    expect(missingFragment(page, 'Fixture start. … Fixture end.')).toBeUndefined();
  });
});

describe('verifyQuotes', () => {
  it('reports each source, fetching each page once', async () => {
    const fetchPage = vi.fn((url: string) =>
      url.endsWith('/down') ? Promise.reject(new Error('HTTP 503')) : Promise.resolve(PAGE),
    );
    const checks = await verifyQuotes(
      [
        item('The fictional ball is round and blue.'),
        item('The fictional ball is square.'),
        item(undefined),
        item('Anything.', 'https://example.com/down'),
      ],
      fetchPage,
    );
    expect(checks.map((c) => c.status)).toEqual(['ok', 'missing', 'no_quote', 'fetch_failed']);
    expect(checks[1]?.detail).toBe('The fictional ball is square.');
    expect(checks[3]?.detail).toContain('HTTP 503');
    expect(fetchPage).toHaveBeenCalledTimes(2);
  });
});

describe('runVerifyQuotes', () => {
  let dir: string;
  let lines: string[];
  let errors: string[];
  const io = () => ({
    today: TODAY,
    log: (l: string) => lines.push(l),
    error: (l: string) => errors.push(l),
  });
  const write = (content: object) => writeFileSync(join(dir, 'content.yaml'), stringify(content));
  const withQuote = (quote: string) => {
    const content = baseContent();
    const [alpha, beta] = content.items;
    return {
      ...content,
      items: [
        { ...alpha, sources: [{ ...FIXTURE_SOURCE, locator: 'Fixture page 1', quote }] },
        { ...beta, sources: [FIXTURE_SOURCE] },
      ],
    };
  };

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'bk-quotes-'));
    lines = [];
    errors = [];
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('exits 0 when every quote is found, warning about sources without one', async () => {
    write(withQuote('It’s a “fictional” page'));
    expect(await runVerifyQuotes([dir], io(), () => Promise.resolve(PAGE))).toBe(0);
    expect(lines).toContain('  warning  fixture.item.beta sources.0: no quote to verify');
    expect(lines.at(-1)).toBe(
      'OK: 1 quote(s) verified, 0 missing, 0 unreadable, 1 without a quote',
    );
  });

  it('exits 1 on a missing quote or an unreadable page', async () => {
    write(withQuote('A quote nobody wrote'));
    expect(await runVerifyQuotes([dir], io(), () => Promise.resolve(PAGE))).toBe(1);
    expect(lines[0]).toMatch(/^ {2}MISSING {2}fixture\.item\.alpha sources\.0 \(Fixture page 1\)/);

    lines = [];
    expect(await runVerifyQuotes([dir], io(), () => Promise.reject(new Error('offline')))).toBe(1);
    expect(lines[0]).toMatch(/^ {2}FAILED {3}.*offline/);
  });

  it('refuses invalid content, bad usage, and a missing directory', async () => {
    write({ ...baseContent(), units: [] });
    const never = () => Promise.reject(new Error('should not fetch'));
    expect(await runVerifyQuotes([dir], io(), never)).toBe(1);
    expect(await runVerifyQuotes(['--ship'], io(), never)).toBe(2);
    expect(await runVerifyQuotes([join(dir, 'nope')], io(), never)).toBe(2);
    expect(errors).toContain(VERIFY_USAGE);
  });
});
