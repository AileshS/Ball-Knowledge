/**
 * Number tracing: a cheap, mechanical guard against the most damaging kind of
 * content error, a wrong number. It can't judge meaning, but it can insist that
 * every number a user sees appears in the quoted source (or is declared as derived).
 */

const NUMBER_WORDS: Readonly<Record<string, string>> = {
  zero: '0',
  one: '1',
  two: '2',
  three: '3',
  four: '4',
  five: '5',
  six: '6',
  seven: '7',
  eight: '8',
  nine: '9',
  ten: '10',
  eleven: '11',
  twelve: '12',
  thirteen: '13',
  fourteen: '14',
  fifteen: '15',
  sixteen: '16',
  seventeen: '17',
  eighteen: '18',
  nineteen: '19',
  twenty: '20',
  thirty: '30',
  forty: '40',
  fifty: '50',
  hundred: '100',
};

const WORD = new RegExp(`\\b(${Object.keys(NUMBER_WORDS).join('|')})\\b`, 'g');
const NUMBER = /\d+(?:\.\d+)?[⅓⅔½¼¾]?|[⅓⅔½¼¾]/g;

/**
 * The numbers in a piece of text, normalized: number words become digits
 * ("two yards" → "2") and thousands separators are dropped ("1,000" → "1000").
 */
export function numbersIn(text: string): string[] {
  const normalized = text
    .toLowerCase()
    .replace(WORD, (w) => NUMBER_WORDS[w] ?? w)
    .replace(/(\d),(?=\d{3}\b)/g, '$1');
  return normalized.match(NUMBER) ?? [];
}

/** Numbers in `text` that are not in `allowed`. */
export function untracedNumbers(text: string, allowed: ReadonlySet<string>): string[] {
  return [...new Set(numbersIn(text))].filter((n) => !allowed.has(n));
}
