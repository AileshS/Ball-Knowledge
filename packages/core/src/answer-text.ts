/**
 * The one rule for comparing answer text, shared by the content checker and the app,
 * so an option the checker considers distinct is never graded as the answer.
 * Ignores case, surrounding/extra spaces, punctuation, and a leading article
 * ("The end zone" = "end zone").
 */
export function normalizeAnswer(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[’'".,!?;:()[\]{}-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(the|a|an) /, '');
}
