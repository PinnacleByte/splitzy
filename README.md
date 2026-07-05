# Splitzy

A friendly Splitwise-style bill-splitter, built as an installable PWA for a small group of real friends — flexible splitting (equal, shares, itemized, per-night hotel stays, diet/smoker/drinker-aware categories), plus friend invites and multi-device sync backed by Supabase.

## Stack

- **Next.js 16** (App Router, React 19) — note this fork renames `middleware.ts` to **`proxy.ts`**; see [proxy.ts](proxy.ts)
- **Supabase** — Postgres, Auth (passwordless email OTP), Row Level Security, Realtime
- **Tailwind v4**, installed as a PWA (manifest + service worker)

## Local setup

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Create a Supabase project** at [supabase.com](https://supabase.com) (or use an existing one).

3. **Run the schema.** Open the SQL editor in your Supabase project and run the whole contents of [supabase/schema.sql](supabase/schema.sql). It creates all tables, Row Level Security policies, the new-user profile trigger, and the invite-accept functions. It's idempotent — safe to re-run.

4. **Set your environment variables.** Copy the example file and fill in your project's URL + anon key (Project Settings → API in the Supabase dashboard):

   ```bash
   cp .env.local.example .env.local
   ```

5. **Run the dev server**

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000). You'll land on `/login` — sign in with an email, and you'll get a 6-digit code (no password).

## How invites work

Every group member has to be a real Splitzy account — there's no more "type a name" placeholder. To bring a friend in:

- **Friends** tab → **Invite a friend**, or **New group** → **Invite someone new**, or a group's **member list** → **Invite someone new to this group**.
- This generates a one-time link (`/invite/{code}`), shared via the device's native share sheet (or copied to clipboard).
- Your friend opens the link, signs in with their own email OTP, and accepting the invite connects you as friends — and joins them into the group, if the invite was group-scoped.

See [lib/invites.ts](lib/invites.ts) and [supabase/schema.sql](supabase/schema.sql) (`accept_invite`, `get_invite_preview`) for the details.

## Install as an app

On your phone, open the deployed site and use your browser's **Share → Add to Home Screen** for a full-screen, installable experience (see `public/manifest.webmanifest`).

## Deploying

Deploy target is [Vercel](https://vercel.com/new). Set the two `NEXT_PUBLIC_SUPABASE_*` environment variables in your Vercel project settings, matching `.env.local`.
