# 0003. Supabase for accounts and progress sync

- **Status:** Accepted
- **Date:** 2026-10-02
- **Deciders:** Owner

## Context

The PRD (§6, §11) requires sign-up and login with email plus Apple and Google sign-in. A user's progress has to persist across devices: per-item memory state, the review log, XP, and streaks. The data is relational:

- users ↔ knowledge items ↔ entities
- review logs feed analytics such as the north-star metric (PRD §12)

None of this is needed to prove the core learning loop, which can run fully on-device first.

Options considered: **Supabase** (Postgres, built-in auth, row-level security), Firebase (mature mobile SDKs, document database), or deferring the choice.

## Decision

- Use **Supabase**:
  - Supabase Auth for email, Apple, and Google sign-in.
  - Postgres for `user_item_state`, `review_log`, and progress.
  - **Row-level security** on every user table.
- **Timing:** the backend arrives in **Phase 7**, after the offline playable slice. Until then the app is local-first, with persistence behind a repository interface so Supabase can slot in without touching game logic.
- **Content isn't authored in the database.** Lessons, items, and entities stay versioned data files in the repo (CLAUDE.md conventions), compiled into a bundle.

## Consequences

- **Sync model:** clients append to a review log, and server state is reproducible by replaying the log. The scheduler is deterministic, so replay gives the same result on any device.
- **Migrations are forward-only and reviewed.** Tables holding user data are never dropped or truncated.
- **Separate dev and prod projects.** Running Supabase locally needs Docker, which isn't installed, so development uses a hosted dev project unless Docker Desktop is added later.
- **Secrets never enter git:** keys live in `.env` files, which are gitignored, and only `.env.example` is committed.
- **App Store requirements to plan for in Phase 7:**
  - In-app account deletion.
  - Rules for apps offering third-party login. Sign in with Apple, already in the PRD, covers this alongside Google sign-in.
  
  Re-check the current App Store Review Guidelines before submission.

## Update (2026-10-03, Phase 7)

- **Sign-in:** an emailed 6-digit code (Supabase email OTP), which works the same on web and phones. Apple and Google come later, once their developer accounts exist.
- **Storage:** the server stores only the append-only `review_log` and `lesson_completions`. Item memory state is never stored there; each device rebuilds it by replaying the merged log. That makes sync conflict-free: answers made offline on two devices simply both count.
- **Device ownership:** a device's progress belongs to the first account that signs in on it. If a different account signs in, sync stops, and the user must explicitly choose to replace that device's copy. Two people's learning is never merged.
- **Account deletion:** the `delete_my_account()` database function deletes the account and cascades to all of its synced rows.
- **Setup:** see [docs/supabase-setup.md](../supabase-setup.md).
