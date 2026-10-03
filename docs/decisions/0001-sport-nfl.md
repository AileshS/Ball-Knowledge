# 0001. v1 ships the NFL

- **Status:** Accepted
- **Date:** 2026-10-02
- **Deciders:** Owner

## Context

The PRD (§5, §13.1) limits v1 to a single sport and recommends the NFL, with the NBA as the strong alternative. The choice had to be confirmed before any content production starts, because every lesson, knowledge item, and entity is sport-specific.

- **NFL:** deepest fit for the Present track the app is built around. It has position groups most fans ignore (O-line, D-line, linebackers, secondary, specialists), contracts and trades, a long history with clear eras, and huge US interest.
- **NBA:** fewer players to learn and very highlight-friendly, but less depth for the "positions fans overlook" angle.

## Decision

v1 ships the **NFL**.

## Consequences

- All v1 content production (Foundations, Past, Present) targets the NFL.
- Shared code stays **sport-agnostic** (CLAUDE.md principle 6). NFL position groups, eras, and rules are **content data**, never enums or hard-coded branches in shared models. Adding a second sport should mean adding content, not changing schemas.
- The sport picker shows the NFL as live and other sports as "coming soon" (PRD §6).
- The NBA is the natural second sport. Nothing in the domain model may assume football-only concepts such as downs, or that every sport has a fixed set of eleven-player units.
