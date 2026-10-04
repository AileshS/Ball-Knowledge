# Supabase setup (accounts and sync)

The app works fully offline without this. Do these steps once per Supabase project (dev now, and prod later as a separate project, per ADR 0003). Each step happens in the [Supabase dashboard](https://supabase.com/dashboard).

## 1. Add the project's public key to the app

1. Open your project, then **Project Settings → API Keys** (or the **Connect** button). Copy the **anon / publishable** key.
2. Paste it into `apps/mobile/.env` after `EXPO_PUBLIC_SUPABASE_ANON_KEY=`. The project URL is already there.
   - This file is gitignored and never committed.
   - The anon/publishable key is designed to ship inside apps, because row-level security protects the data.
   - **Never** use the `service_role` / secret key in the app or paste it anywhere.

## 2. Create the tables

1. Open **SQL Editor → New query**.
2. Paste the whole of [`supabase/migrations/20261003000000_progress_sync.sql`](../supabase/migrations/20261003000000_progress_sync.sql) and click **Run**.
3. This creates:
   - `review_log`, the append-only answer history
   - `lesson_completions`
   - row-level security, so each user sees only their own rows
   - `delete_my_account()` for in-app account deletion

Migrations are forward-only. Run each file once, in order, and never edit one that has already run. Future changes come as new files.

## 3. Turn off email confirmation

The app signs in with **email and password**. With email confirmation off, Supabase sends **no emails at all**, so you need no SMTP and no template edits. (New free projects can't edit templates on Supabase's built-in sender anyway.)

1. Open **Authentication → Sign In / Providers → Email**.
2. Keep **Enable Email provider** on.
3. Turn **Confirm email** off and save.

## 4. Before real users (later)

- **Custom SMTP:** set it up under **Authentication → Emails → SMTP Settings** before a beta, using an email service such as Resend, SendGrid, or Postmark. Supabase's built-in sender only emails members of your Supabase organization, at about 2 emails an hour. "Forgot password" emails and turning **Confirm email** back on (to verify addresses) both depend on this.
- **Prod project:** create a separate prod project and run the same migrations there.
- **Apple and Google sign-in:** these come later (roadmap). They need an Apple Developer account and a Google OAuth client.

## Check it works

1. Restart the app (`npm run web -w @ball-knowledge/mobile`).
2. The home screen shows **Sign in to sync your progress**. Tap it, choose **New here? Create an account**, and enter an email and a password of at least 8 characters.
3. The account screen should say **Synced**.
4. In the dashboard under **Table Editor → review_log**, you'll see your answers.
