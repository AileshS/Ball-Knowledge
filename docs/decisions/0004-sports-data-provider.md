# 0004. Sports-data provider for Present-track stats and contracts

- **Status:** Deferred. **Decision gate:** must be accepted before any Present-track stat or contract content is authored (roadmap Phase 11).
- **Date:** 2026-10-02
- **Deciders:** Owner (pending)

## Context

The Present track (PRD §7.3, §10) needs current stats, contracts, and rosters, refreshed through the season and offseason. Two requirements shape this:

- CLAUDE.md says Present-track stats and contracts are **referenced by ID from a data provider**, not copied into lesson text, so numbers can update without rewriting lessons.
- Accuracy is non-negotiable (principle 4).

Commercial NFL data providers (for example Sportradar, SportsDataIO, and Stats Perform) differ widely in cost, coverage, and license terms. Contract data and advanced metrics for overlooked positions, such as O-line pass-blocking, are often sold separately or are proprietary.

## Interim decision

- **Build against an interface, not a vendor.** The domain model has a `DataRef { provider, resource, id, field }` type (Phase 2). Present-track `stat` and `contract` items **must** use `DataRef`s rather than literal numbers. The schema enforces this.
- **No Present-track stats or contracts get authored** until this record is accepted.
- Past-track and Foundations content can proceed. It's authored from cited public sources, each with a `source` and `lastVerifiedAt`, and passes owner review.
- **Never scrape** sites whose terms prohibit it.

## Evaluation criteria (for the eventual decision)

1. Coverage of **every** position group, including O-line, D-line, linebackers, secondary, and specialists, not just skill positions.
2. Contract data (cap hit, guarantees, length), or a separately licensable source for it.
3. License terms that allow display in a consumer app, plus attribution requirements.
4. Update frequency and stable entity IDs (players, teams, coaches).
5. Cost at MVP scale and at growth scale.
6. Historical coverage, useful for Past-track cross-checks.

## Consequences

- Present-track lessons can be built and tested with fixture providers before a vendor is chosen.
- A freshness report (Phase 4 content tools) flags Present items whose `lastVerifiedAt` is stale.
