# Content authoring guide

Lessons, facts, and exercises live as YAML files in [`content/`](../content). They're data, not code, so anyone can write and fact-check them.

**Accuracy is non-negotiable** (CLAUDE.md principle 4). Sports fans notice wrong facts, and one error costs the app its credibility. This guide exists to make getting it right the easy path.

## Quick start

1. Copy an existing file such as [`content/nfl/foundations/scoring-and-the-field.yaml`](../content/nfl/foundations/scoring-and-the-field.yaml) and edit it.
2. Run `npm run content:check`. It lists every problem with the file and record it's in.
   Then run `npm run content:verify-quotes`, which fetches each cited page and confirms every `quote` appears on it, word for word (it ignores only typography: spacing, curly vs. straight quotes, dash styles). A number must match whole ("3" never matches inside "13"), and the parts of a quote split by `…` must sit close together on the page; when two passages are far apart, cite them as two sources.
3. Open a pull request. A second person reviews the facts against their sources. Once confirmed, the reviewer sets `reviewStatus: approved`.

`npm run content:build` writes the bundle the app loads (`dist/content/content.json`). Release builds use `--ship`, which refuses anything that isn't approved.

## File layout

```
content/
  nfl/
    sport.yaml                       the sport itself
    foundations/<unit>.yaml          one file per unit is easiest to review
    past/<unit>.yaml
    present/<unit>.yaml
```

Each file is a map of lists. You can use any of these keys: `sports`, `units`, `entities`, `items`, `exercises`, `lessons`, `tips`.

Keys starting with `x-` are ignored. Use them to hold a shared source once and reuse it with `<<: *anchor`:

```yaml
x-sources:
  rulebook: &rulebook
    url: https://operations.nfl.com/the-rules/nfl-rulebook/index.html
    title: 2026 NFL Rulebook
    publisher: NFL Football Operations
    accessedAt: 2026-10-02

items:
  - id: nfl.rules.touchdown-points
    # ...
    sources:
      - <<: *rulebook
        locator: Rule 11, Section 1, Article 2
        quote: 'Touchdown: 6 points'
```

## IDs

IDs are lowercase words joined by `.`, `-`, or `_`, and they never change once published. Users' memory state is keyed by ID. Conventions:

| Kind | Pattern | Example |
|---|---|---|
| Unit | `<sport>.<track>.<topic>` | `nfl.foundations.scoring-and-the-field` |
| Item | `<sport>.<area>.<fact>` | `nfl.rules.touchdown-points` |
| Exercise | `<sport>.ex.<area>.<what>` | `nfl.ex.scoring.touchdown-points` |
| Lesson | `<sport>.lesson.<title>` | `nfl.lesson.how-teams-score` |
| Tag | `namespace:value` | `topic:scoring`, `era:<era-id>`, `position:<group>` |

## Writing a fact (knowledge item)

Every item needs:
- **`statement`:** the fact, in one plain sentence.
- **`whyItMatters`:** a short hook that makes it stick. It must be true too. Derive it from the cited facts (arithmetic is fine), never from assumptions such as "rarely", "the first ever", or "used to be".
- **`sources`:** at least one, and each one has:
  - `url`: prefer primary sources (the official rulebook, league records, team sites).
  - `locator`: where in the source the fact appears, e.g. a rule, section, and article, or a page and table.
  - `quote`: the supporting text, copied **verbatim**. Use `…` to skip words. Don't paraphrase.
  - `accessedAt`: the date you read it.
- **`derivedValues`** (only if needed): any number in the statement that you computed rather than quoted, such as a unit conversion. Each entry has the `value` and `from` (how it was computed). The checker requires every other number in the statement to appear in a source quote. It also requires numbers in exercise prompts and answers to appear in the tested facts' statements. A typo like 6 → 7 fails the check.
- **`lastVerifiedAt`:** the date you last confirmed the fact against its sources.
- **`reviewStatus`:** `draft` while writing, `in_review` when ready for a second person, and `approved` only after that person checks every quote against its source.

**Present track (current stats and contracts):** never type the number. Use a placeholder bound to a data reference, so the value can refresh without rewriting the lesson (ADR 0004):

```yaml
statement: Fixture Player Alpha signed for {{apy}} per year.
dataRefs:
  - { key: apy, provider: <provider>, resource: contracts, id: <provider-player-id>, field: apy }
```

The checker rejects literal numbers in Present-track stat or contract items. These items also show up in the freshness report and need re-verifying every 30 days.

## Writing exercises

- Every exercise names the items it tests (`itemIds`), and answers update those items' memory.
- Multiple choice needs at least 2 distractors. A distractor can never equal the answer or any `acceptedAnswers` entry.
- Typed answers: list the common alternatives in `acceptedAnswers` (e.g. `six` for `6`, `fg` for `field goal`).
- Fill-in-the-blank prompts mark the blank with `___`.
- **No player photos or team logos** until they're licensed (ADR 0005). Any `photo` or `clip` cue needs a `textFallback`.

## Writing lessons

- **Length:** 3–5 minutes, with 8–15 interactions counting callbacks, exercises, and the recall check.
- **`introducesItemIds`:** the new facts. Each item is introduced by exactly one lesson, and each one must be tested in that lesson.
- **`recallCheckExerciseIds`:** close the lesson. They may only test the lesson's own new items.
- **`callbackCount` and `callbackHints`:** the app opens the lesson by bringing back earlier items. Choose hint tags that connect to this lesson, such as the same era. The very first lesson uses `callbackCount: 0`.
- **`order`:** the lesson's position within its unit (0 = first).

## Past track: eras and history

- **Era names are our labels; era boundaries are facts.** Each era starts at a documented milestone with its own quote (e.g. the 1933 split into two divisions). Statements say "our Founding Era", "our Open Game Era", and so on, so nobody mistakes a label for an official term.
- **Era entities** (`kind: era`) carry `order`. Tag every history item and entity with `era:<era-id>` so callbacks can connect facts from the same era.
- **Years from page headings:** a chronology page often states the year only in its heading ("1933") and not in the quoted sentence. List such years in `derivedValues` with `from: the year of the Hall of Fame chronology entry quoted`.
- **Preferred sources:** the Pro Football Hall of Fame's year-by-year chronology and enshrinee biographies (profootballhof.com), and NFL Football Operations. Name records "at the time" when a later season might have broken them.

## Memory tips

Use these sparingly: only for big ordered or grouped content, like the sequence of eras or a dynasty's core. A tip links at least 2 items, and a lesson shows at most one. Tips are reviewed like facts. A tip must never bend the facts it anchors.

## Reviewer checklist

Before setting `reviewStatus: approved`, open each source and confirm:

- [ ] The `quote` appears verbatim at the `locator`, in the current edition of the source. (`npm run content:verify-quotes` proves the words are on the page; you still confirm the locator and that the quote means what the statement says.)
- [ ] The `statement` says exactly what the quote supports: no more, no less. Every `derivedValues` computation is correct.
- [ ] The `whyItMatters` line is true and follows from cited facts.
- [ ] Exercise answers are correct, and no distractor could also be right.
- [ ] Nothing uses photos, logos, or invented numbers.
