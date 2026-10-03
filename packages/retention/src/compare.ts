/**
 * Code-point string comparison. Unlike `localeCompare`, the result never depends on
 * the device's locale or ICU data, so orderings are identical everywhere.
 */
export function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
