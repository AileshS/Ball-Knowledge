-- Ball Knowledge: allow placement-quiz answers in the review log (Phase 8).
--
-- Forward-only. Widens the allowed `context` values; existing rows are unaffected.
-- Run this before (or together with) shipping the app version that has the
-- placement quiz, or syncing a placement answer will be rejected.

alter table public.review_log drop constraint review_log_context_check;

alter table public.review_log
  add constraint review_log_context_check
  check (context in ('lesson', 'callback', 'recall_check', 'review', 'placement'));
