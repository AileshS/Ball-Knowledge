-- Ball Knowledge: progress sync (ADR 0003).
--
-- Forward-only. Never edit this file after it has run; add a new migration instead.
-- Tables holding user data are never dropped or truncated.
--
-- Design: the review log is the source of truth. Devices append to it and rebuild
-- memory state by replaying it (the scheduler is deterministic), so no item state
-- is stored here and nothing ever needs updating, only appending.

-- 1. The append-only answer log -------------------------------------------------

create table public.review_log (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- Deterministic per answer ("<itemId>@<reviewedAt ISO>"), so re-sending is harmless.
  id text not null check (char_length(id) between 1 and 300),
  item_id text not null check (char_length(item_id) between 1 and 200),
  reviewed_at timestamptz not null,
  grade text not null check (grade in ('again', 'hard', 'good', 'easy')),
  correct boolean not null,
  cue text not null check (cue in ('name', 'photo', 'jersey', 'stat', 'timeline', 'clip')),
  exercise_type text not null check (
    exercise_type in (
      'multiple_choice', 'identify', 'match', 'timeline_order',
      'higher_lower', 'who_did_it', 'fill_blank', 'clip'
    )
  ),
  context text not null check (context in ('lesson', 'callback', 'recall_check', 'review')),
  response_ms integer check (response_ms >= 0),
  days_since_first_learned double precision not null check (days_since_first_learned >= 0),
  created_at timestamptz not null default now(),
  primary key (user_id, id),
  -- Same rule as the app: "again" means incorrect, every other grade means correct.
  check (correct = (grade <> 'again'))
);

comment on table public.review_log is
  'Append-only answer log per user; devices rebuild memory state by replaying it.';

-- 2. Completed lessons ---------------------------------------------------------------

create table public.lesson_completions (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  lesson_id text not null check (char_length(lesson_id) between 1 and 200),
  -- When the lesson was first completed, on any device.
  completed_at timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (user_id, lesson_id)
);

-- 3. Row-level security: each user sees and adds only their own rows -----------------

alter table public.review_log enable row level security;
alter table public.lesson_completions enable row level security;

create policy "Users read their own answers"
  on public.review_log for select to authenticated
  using (user_id = (select auth.uid()));

create policy "Users append their own answers"
  on public.review_log for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "Users read their own lessons"
  on public.lesson_completions for select to authenticated
  using (user_id = (select auth.uid()));

create policy "Users add their own lessons"
  on public.lesson_completions for insert to authenticated
  with check (user_id = (select auth.uid()));

-- No update or delete policies: the log is append-only. Rows go away only when the
-- account is deleted (cascade from auth.users).

revoke all on public.review_log, public.lesson_completions from anon, authenticated;
grant select, insert on public.review_log, public.lesson_completions to authenticated;

-- 4. In-app account deletion (required by the App Store) -----------------------------

create function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  -- Cascades to review_log and lesson_completions.
  delete from auth.users where id = auth.uid();
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
