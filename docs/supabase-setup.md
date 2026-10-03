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

## 3. Send a 6-digit code instead of a link

The app signs in with an emailed code. Codes work identically on web and phones, with no deep-link setup.

Supabase uses two templates for this: **Confirm signup** for someone's very first sign-in, and **Magic Link** for later ones. Update **both**, or new users get a link the app can't use.

1. Open **Authentication → Emails → Templates**.
2. In **Confirm signup**, make sure the body includes the code, for example:

   ```html
   <h2>Your Ball Knowledge sign-in code</h2>
   <p>Enter this code in the app: <strong>{{ .Token }}</strong></p>
   ```

3. Do the same in **Magic Link**. Save both.
4. Email sign-in is on by default (**Authentication → Sign In / Providers → Email**). Leave it enabled.

## 4. Before real users (later)

- **Email sending:** Supabase's built-in email sender is rate-limited and meant for testing. Set up custom SMTP under **Authentication → Emails** before a beta.
- **Prod project:** create a separate prod project and run the same migrations there.
- **Apple and Google sign-in:** these come later (roadmap). They need an Apple Developer account and a Google OAuth client.

## Check it works

1. Restart the app (`npm run web -w @ball-knowledge/mobile`).
2. The home screen shows **Sign in to sync your progress**. Tap it, enter your email, and type in the code from the email.
3. The account screen should say **Synced**.
4. In the dashboard under **Table Editor → review_log**, you'll see your answers.
