# Splitzy

A friendly Splitwise-style bill-splitter, built as an installable PWA for a small group of real friends — flexible splitting (equal, shares, itemized, per-night hotel stays, diet/smoker/drinker-aware categories), plus admin-managed accounts and multi-device sync backed by Supabase.

## Stack

- **Next.js 16** (App Router, React 19) — note this fork renames `middleware.ts` to **`proxy.ts`**; see [proxy.ts](proxy.ts)
- **Supabase** — Postgres, Auth (email + password), Row Level Security, Realtime
- **Tailwind v4**, installed as a PWA (manifest + service worker)

## Local setup

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Create a Supabase project** at [supabase.com](https://supabase.com) (or use an existing one).

3. **Run the schema.** Open the SQL editor in your Supabase project and run the whole contents of [supabase/schema.sql](supabase/schema.sql). It creates all tables, Row Level Security policies, and the new-user profile trigger. It's idempotent — safe to re-run.

4. **Set your environment variables.** Copy the example file and fill in your project's URL, anon key, and service role key (Project Settings → API in the Supabase dashboard):

   ```bash
   cp .env.local.example .env.local
   ```

   `SUPABASE_SERVICE_ROLE_KEY` is sensitive (bypasses Row Level Security) — server-only, never commit it, never expose it to the client. `NEXT_PUBLIC_ADMIN_EMAIL` is the one account allowed to add friends (see below).

5. **Run the dev server**

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000) and sign in with the admin account's email + password.

## How adding friends works

There's no self-serve signup — every account is created by the admin (`NEXT_PUBLIC_ADMIN_EMAIL`), which avoids depending on Supabase's rate-limited shared email sender entirely.

- **Friends** tab → **Add a friend**, or **New group** → **Add someone new**, or a group's **member list** → **Add someone new to this group** (admin-only; enforced both in the UI and server-side in the Server Action).
- Fill in their name, email, and a temp password — this calls the Supabase Admin API (`lib/adminActions.ts`) to create a pre-confirmed account directly, no email round-trip. They're connected as your friend immediately (and added to the group, if launched from one).
- Tell them their email + temp password out of band (text, in person). They sign in at `/login` and can change their password anytime from **Account → Change password**, and set their own display name from **Account** (tap the name).

See [lib/adminActions.ts](lib/adminActions.ts) and [lib/supabase/admin.ts](lib/supabase/admin.ts) for the details.

## Install as an app

On your phone, open the deployed site and use your browser's **Share → Add to Home Screen** for a full-screen, installable experience (see `public/manifest.webmanifest`).

## Deploying

Deploy target is [Vercel](https://vercel.com/new). Set all four environment variables from `.env.local` in your Vercel project settings (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_ADMIN_EMAIL`) and redeploy.
