import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parseDocument } from 'yaml';

/** The collections a content file may contain, each a list of records. */
export const COLLECTIONS = [
  'sports',
  'units',
  'entities',
  'items',
  'exercises',
  'lessons',
  'tips',
] as const;
export type Collection = (typeof COLLECTIONS)[number];

/** One authored record plus where it came from, so problems point at the file. */
export interface RawRecord {
  readonly collection: Collection;
  readonly file: string;
  readonly index: number;
  readonly data: unknown;
}

export interface LoadIssue {
  readonly file: string;
  readonly message: string;
}

export interface LoadResult {
  readonly records: RawRecord[];
  readonly issues: LoadIssue[];
}

function yamlFiles(dir: string): string[] {
  return readdirSync(dir)
    .sort()
    .flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return yamlFiles(path);
      return /\.ya?ml$/.test(name) ? [path] : [];
    });
}

/**
 * Parses one YAML document. Its top level is a map from collection name to a list
 * of records, e.g. `items: [...]`. YAML anchors and merge keys work within a file,
 * so a shared source can be written once and extended per fact
 * (`<<: *rulebook` plus a `locator` and `quote`).
 */
export function parseContentFile(text: string, file: string): LoadResult {
  // `merge` enables `<<: *anchor`, so a shared source can be extended per fact.
  const doc = parseDocument(text, { prettyErrors: true, merge: true });
  if (doc.errors.length > 0) {
    return { records: [], issues: doc.errors.map((e) => ({ file, message: e.message })) };
  }
  const value: unknown = doc.toJS();
  if (value === null || value === undefined) return { records: [], issues: [] };
  if (typeof value !== 'object' || Array.isArray(value)) {
    return { records: [], issues: [{ file, message: 'Top level must be a map of collections' }] };
  }

  const records: RawRecord[] = [];
  const issues: LoadIssue[] = [];
  for (const [key, list] of Object.entries(value)) {
    // `x-` keys hold YAML anchors (e.g. a shared source) and are not records.
    if (key.startsWith('x-')) continue;
    if (!(COLLECTIONS as readonly string[]).includes(key)) {
      issues.push({
        file,
        message: `Unknown collection "${key}" (expected one of: ${COLLECTIONS.join(', ')})`,
      });
      continue;
    }
    if (!Array.isArray(list)) {
      issues.push({ file, message: `"${key}" must be a list` });
      continue;
    }
    list.forEach((data: unknown, index) =>
      records.push({ collection: key as Collection, file, index, data }),
    );
  }
  return { records, issues };
}

/** Loads every `.yaml`/`.yml` file under `dir`, in a stable order. */
export function loadContentDir(dir: string): LoadResult {
  const records: RawRecord[] = [];
  const issues: LoadIssue[] = [];
  for (const path of yamlFiles(dir)) {
    const file = relative(process.cwd(), path).replaceAll('\\', '/');
    const result = parseContentFile(readFileSync(path, 'utf8'), file);
    records.push(...result.records);
    issues.push(...result.issues);
  }
  return { records, issues };
}
