# Splitzy

A friendly Splitwise-style bill-splitter, built as an installable PWA for a small group of real friends — flexible splitting (single or mixed bills, shares, itemized, per-night hotel stays, with diet/drinker/smoker-aware auto-selection), auto-balanced or detailed settle-ups, per-member spend stats, self-serve accounts with per-user isolated friend circles, and multi-device sync backed by Supabase.

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

   `SUPABASE_SERVICE_ROLE_KEY` is sensitive (bypasses Row Level Security) — server-only, never commit it, never expose it to the client. It's used to create accounts via the Supabase admin API (see below).

5. **Run the dev server**

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000) and use **Create account** to make the first account (name + email + password), or sign in if you already have one.

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

### Households (couples & families)

A group can organise its members into **households** — a named couple or family who settle as **one wallet** (e.g. *The Sharmas* = {Dad, Mom}). Manage them from a group's **Households** panel: create a household, give it a name + emoji, and tap member chips to add or remove people. Anyone not in a household is a **single**.

- **Settle as one** — the **Balances** tab and **Settle up** screen gain a **Per household / Per person** toggle. In per-household view, each household's members are merged into a single balance, so you never see internal "Dad owes Mom" noise, and settle-ups net between households (a household paying another is recorded as a real person→person payment behind the scenes, charging whoever in the household owes most).
- **Scoped to the group** — a household lives inside one group only; it is *not* a permanent link between accounts, so the same person can be solo in one group and part of a couple in another.
- **Additive** — `expense_splits` stay strictly **per person** in the database; households are just a grouping entity (`households` table + `group_members.household_id`) plus household-aware aggregation in [lib/balances.ts](lib/balances.ts). Nothing about how bills are entered changes.

## Accounts, friends, and isolated circles

Anyone can **create their own account** from `/login` → **Create account** (name + email + password). This starts a fresh, empty space — your own "circle" of friends and groups. Different circles never see each other: Row Level Security scopes every table to your friend connections and group memberships ([supabase/schema.sql](supabase/schema.sql)), so your dad running his own trip can't see your data and vice-versa.

Account creation (both self-serve signup and adding a friend) goes through the Supabase **admin API** with `email_confirm: true` — accounts are created directly with **no confirmation email**, so nothing depends on Supabase's rate-limited shared email sender.

- **Add a friend** from the **Friends** tab, **New group** → **Add someone new**, or a group's **member list** → **Add someone new to this group**. Any signed-in user can do this — there's no global admin.
- Fill in their name, email, and a temp password — this creates their account and connects them to *you* immediately (and adds them to the group, if launched from one). The symmetric connection is between you and them only, which is what keeps circles separate.
- Tell them their email + temp password out of band (text, in person). They sign in at `/login`, and can change their password anytime from **Account → Change password** and their display name from **Account** (tap the name).

**Note:** because creating an account doesn't verify email, and any signed-in user can create accounts, this is designed for private friends-and-family instances rather than a public product. Emails are globally unique across the whole instance, so the same person can't be created independently in two different circles.

See [lib/accountActions.ts](lib/accountActions.ts) and [lib/supabase/admin.ts](lib/supabase/admin.ts) for the details.

## Install as an app

On your phone, open the deployed site and use your browser's **Share → Add to Home Screen** for a full-screen, installable experience (see `public/manifest.webmanifest`).

## Deploying

Deploy target is [Vercel](https://vercel.com/new). Set all three environment variables from `.env.local` in your Vercel project settings (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) and redeploy.

## Roadmap

### Split per household (planned)

[Households](#households-couples--families) already group couples/families for **balances and settle-ups**. The remaining piece is a per-household **split mode** in the Add-expense wizard: a bill would divide once per unit instead of per head (a $300 dinner among 3 families = $100 each, not ÷ 6 people), then fan back out to `expense_splits` per person within each household. Splitting per person stays the default; per-household would just be another mode.

This stays additive: the split engine ([lib/split.ts](lib/split.ts)) already operates on participant sets and amounts, so a household is treated as one participant whose share is then divided among its members. No schema change is needed beyond the existing `households` table.
