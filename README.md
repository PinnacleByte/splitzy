# Splitzy

A friendly Splitwise-style bill-splitter, built as an installable PWA for a small group of real friends — flexible splitting (single or mixed bills, shares, itemized, per-night hotel stays, with diet/drinker/smoker-aware auto-selection), auto-balanced or detailed settle-ups, per-member spend stats, admin-managed accounts, and multi-device sync backed by Supabase.

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

## How splitting works

Every expense starts by choosing a **bill type**:

- **Single bill** — one purpose, split among the relevant people. Pick **Food** (veg / non-veg), **Drinks** (alcoholic / non-alcoholic), or **Other**, and the right members are pre-selected from their profile tags (veg, drinker, smoker, …). Tap anyone to override for that one bill. A **Custom / advanced** option covers uneven splits by shares or a fully itemized bill.
- **Mixed bill** — one payment that spans several categories (a night out, a grocery run). Enter what was spent on each part — veg food, non-veg food, alcohol, soft drinks, cigarettes, and (for groceries) a catch-all **Other** — and each part is split among its own set of people. The bill total is tallied automatically from the parts.

Member tags are set per person under **Account** (yourself) and **Friends** (others); they only seed the defaults and never lock a split. See [lib/categories.ts](lib/categories.ts) for the bucket/template model and [app/groups/[id]/add/page.tsx](app/groups/%5Bid%5D/add/page.tsx) for the wizard.

### Balances

Each group's **Balances** tab offers two views (toggle at the top):

- **Auto-balanced** (default) — mutual debts cancel out and everything is reduced to the fewest payments, so two people who each fronted roughly the same simply show as settled.
- **Detailed** — every debt is shown in full, in both directions, without cancelling.

**Group stats** below the balances show what each member **paid** (fronted) versus their **share** (consumed), and badge the biggest individual payer. The math lives in [lib/balances.ts](lib/balances.ts).

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
