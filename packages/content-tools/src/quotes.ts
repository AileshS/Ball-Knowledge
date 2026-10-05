/**
 * Mechanical quote verification: does each source's `quote` really appear on the
 * page its `url` points to? This is the reviewer's first check (content-authoring
 * guide), automated so a typo or paraphrase can't slip through as a "verbatim"
 * quote. It needs the network, so it runs on demand (`npm run content:verify-quotes`),
 * not in `npm run check`.
 */
import type { KnowledgeItem } from '@ball-knowledge/core';

const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  quot: '"',
  apos: "'",
  lt: '<',
  gt: '>',
  nbsp: ' ',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  frac13: '⅓',
  frac12: '½',
};

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]\w*);/gi, (whole, name: string) => {
    if (name.startsWith('#')) {
      const code =
        name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : Number(name.slice(1));
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    return NAMED_ENTITIES[name.toLowerCase()] ?? whole;
  });
}

const STRING_LITERAL = /"((?:[^"\\\n]|\\.)*)"/g;

/** Parses a JS/JSON string literal body, or returns undefined if it isn't one. */
function parseLiteral(body: string): string | undefined {
  try {
    const value: unknown = JSON.parse(`"${body}"`);
    return typeof value === 'string' ? value : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The human-readable strings inside serialized page data (e.g. a framework's
 * embedded JSON), in document order. Keys, element names and keys (`"$","p","p-2"`),
 * class names and references are structure, not text, so they're skipped; otherwise a quote
 * spanning two list items would have tag names wedged between them.
 */
function textStrings(serialized: string): string[] {
  const out: string[] = [];
  for (const match of serialized.matchAll(STRING_LITERAL)) {
    const raw = parseLiteral(match[1] ?? '');
    // React Flight marks references with a leading "$" and escapes literal text that
    // starts with "$" (like "$34.6M") as "$$".
    if (raw === undefined || raw === '' || (raw.startsWith('$') && !raw.startsWith('$$'))) continue;
    const value = raw.startsWith('$$') ? raw.slice(1) : raw;
    const end = match.index + match[0].length;
    if (/^\s*:/.test(serialized.slice(end, end + 8))) continue; // an object key
    // Element name and React key: ["$","li","li-2",{…}]; class names.
    const before = serialized.slice(Math.max(0, match.index - 48), match.index);
    if (/"\$",\s*("[^"]*",\s*)?$/.test(before) || /"className":\s*$/.test(before)) continue;
    out.push(value);
  }
  return out;
}

/**
 * Pulls out the raw text rows of a React Flight stream (`5:T4b1,<text>`, where the
 * hex length counts UTF-8 bytes). Long rich text arrives this way, unquoted, so the
 * string reader would miss it, and a stray `"` inside it would throw that reader
 * off for the rest of the stream.
 */
function splitTextRows(flight: string): { textRows: string[]; rest: string } {
  const textRows: string[] = [];
  let rest = '';
  let last = 0;
  const header = /(?:^|\n)[0-9a-f]+:T([0-9a-f]+),/g;
  for (let m = header.exec(flight); m !== null; m = header.exec(flight)) {
    const start = m.index + m[0].length;
    const bytes = Buffer.from(flight.slice(start), 'utf8');
    const text = bytes.subarray(0, parseInt(m[1] ?? '0', 16)).toString('utf8');
    textRows.push(text);
    rest += flight.slice(last, m.index) + '\n';
    last = start + text.length;
    header.lastIndex = last;
  }
  return { textRows, rest: rest + flight.slice(last) };
}

/**
 * All the text a reader could see on a page: the rendered HTML plus any text a
 * framework ships as embedded data and renders client-side. Next.js streams that
 * data as string chunks (`self.__next_f.push([1,"…"])`) that can split mid-word, so
 * the chunks are joined before the text inside them is read.
 */
export function pageText(html: string): string {
  const scripts: string[] = [];
  const visible = html
    .replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gi, (_, body: string) => {
      scripts.push(body);
      return ' ';
    })
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ');
  let flight = '';
  const embedded: string[] = [];
  for (const body of scripts) {
    if (body.includes('__next_f')) {
      for (const match of body.matchAll(STRING_LITERAL))
        flight += parseLiteral(match[1] ?? '') ?? '';
    } else {
      embedded.push(...textStrings(body));
    }
  }
  const { textRows, rest } = splitTextRows(flight);
  // Embedded strings can carry their own markup (CMS rich text with links inline).
  const data = [...embedded, ...textRows, ...textStrings(rest)].map((s) =>
    s.replace(/<[^>]+>/g, ' '),
  );
  return decodeEntities([visible, ...data].join(' '));
}

/**
 * A comparison key that ignores typography, not wording: whitespace, curly vs
 * straight quotes, dash styles, and the replacement character some pages show in
 * place of an apostrophe. Letters, digits, and punctuation must still match.
 */
export function quoteKey(text: string): string {
  return (
    text
      .normalize('NFKC')
      .replace(/[‘’‚‛′`´�]/g, "'")
      .replace(/[“”„″]/g, '"')
      .replace(/[‐-―−]/g, '-')
      // Keep separate numbers apart ("2 15" must not read as "215"), then drop spacing.
      .replace(/(\d)\s+(?=\d)/g, '$1|')
      .replace(/\s+/g, '')
  );
}

/** How far apart (in key characters) two `…`-separated fragments may be. */
export const MAX_FRAGMENT_GAP = 2000;

/** A match must not start or end in the middle of a number ("3" inside "13"). */
function onNumberBoundary(page: string, at: number, key: string): boolean {
  const before = page[at - 1] ?? '';
  const after = page[at + key.length] ?? '';
  return !(/^\d/.test(key) && /\d/.test(before)) && !(/\d$/.test(key) && /\d/.test(after));
}

/**
 * Where a quote fails to match `pageKey` (a `quoteKey` of the page): undefined if
 * every fragment (split at `…` or `...`) appears in order, each within
 * MAX_FRAGMENT_GAP of the one before, otherwise the first fragment that can't be
 * placed.
 */
export function missingFragment(pageKey: string, quote: string): string | undefined {
  const fragments = quote
    .split(/…|\.\.\./)
    .map((f) => f.trim())
    .filter((f) => f !== '');
  let deepest = 0;
  const place = (i: number, from: number, latestStart: number): boolean => {
    const fragment = fragments[i];
    if (fragment === undefined) return true;
    deepest = Math.max(deepest, i);
    const key = quoteKey(fragment);
    for (let at = pageKey.indexOf(key, from); at >= 0 && at <= latestStart;) {
      const end = at + key.length;
      if (onNumberBoundary(pageKey, at, key) && place(i + 1, end, end + MAX_FRAGMENT_GAP)) {
        return true;
      }
      at = pageKey.indexOf(key, at + 1);
    }
    return false;
  };
  return place(0, 0, pageKey.length) ? undefined : fragments[deepest];
}

export type QuoteStatus = 'ok' | 'missing' | 'no_quote' | 'fetch_failed';

export interface QuoteCheck {
  readonly itemId: string;
  readonly sourceIndex: number;
  readonly url: string;
  readonly locator?: string;
  readonly status: QuoteStatus;
  /** The fragment that wasn't found, or why the page couldn't be read. */
  readonly detail?: string;
}

/** Fetches a page's raw HTML (or throws). Injected so tests never touch the network. */
export type FetchPage = (url: string) => Promise<string>;

/**
 * Checks every quoted source of every item. Each distinct URL is fetched once,
 * however many facts cite it.
 */
export async function verifyQuotes(
  items: readonly KnowledgeItem[],
  fetchPage: FetchPage,
): Promise<QuoteCheck[]> {
  const pages = new Map<string, Promise<string>>();
  const page = (url: string): Promise<string> => {
    let pending = pages.get(url);
    if (!pending) {
      pending = fetchPage(url).then((html) => quoteKey(pageText(html)));
      pages.set(url, pending);
    }
    return pending;
  };

  const checks: QuoteCheck[] = [];
  for (const item of items) {
    for (const [sourceIndex, source] of item.sources.entries()) {
      const base = { itemId: item.id, sourceIndex, url: source.url, locator: source.locator };
      if (source.quote === undefined) {
        checks.push({ ...base, status: 'no_quote' });
        continue;
      }
      try {
        const missing = missingFragment(await page(source.url), source.quote);
        checks.push(
          missing === undefined
            ? { ...base, status: 'ok' }
            : { ...base, status: 'missing', detail: missing },
        );
      } catch (err) {
        checks.push({ ...base, status: 'fetch_failed', detail: String(err) });
      }
    }
  }
  return checks;
}
