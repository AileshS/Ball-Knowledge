/**
 * Quote verification entry point (see run-verify-quotes.ts). Needs the network.
 *   verify-quotes [dir]   check every source quote against its live page
 */
import { runVerifyQuotes } from './run-verify-quotes';

function today(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

async function fetchPage(url: string): Promise<string> {
  const response = await fetch(url, {
    // Some publishers refuse requests without a browser-like user agent.
    headers: { 'user-agent': 'Mozilla/5.0 (ball-knowledge content verifier)' },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

process.exitCode = await runVerifyQuotes(
  process.argv.slice(2),
  { today: today(), log: (line) => console.log(line), error: (line) => console.error(line) },
  fetchPage,
);
