# Architecture & product decision records

Each significant decision gets a short record so the reasoning outlives the conversation where it was made. Records are **append-only**: to change a decision, add a new record that supersedes the old one and update the old record's status. Don't rewrite history.

| # | Decision | Status |
|---|---|---|
| [0001](0001-sport-nfl.md) | v1 ships the NFL | Accepted (2026-10-02) |
| [0002](0002-stack-expo-typescript.md) | Expo (React Native) + TypeScript, npm-workspaces monorepo | Accepted (2026-10-02) |
| [0003](0003-backend-supabase.md) | Supabase for accounts and progress sync, arriving after the offline slice | Accepted (2026-10-02) |
| [0004](0004-sports-data-provider.md) | Sports-data provider for Present-track stats and contracts | Deferred: gate before Present content |
| [0005](0005-media-rights.md) | Clips, player photos, and team logos | Deferred: text-first until licensed |
| [0006](0006-no-daily-stop.md) | No daily goal or "done for today" stop | Accepted (2026-10-03) |

## Template

Copy this into `NNNN-short-title.md`:

```markdown
# NNNN. Title

- **Status:** Proposed | Accepted | Deferred | Superseded by NNNN
- **Date:** YYYY-MM-DD
- **Deciders:** who made the call

## Context
What problem or question forced a decision? What constraints apply?

## Decision
What we chose, stated plainly.

## Consequences
What becomes easier, what becomes harder, and what we must now do (or never do) because of this.
```
