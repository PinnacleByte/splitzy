-- Splitzy — Supabase schema
-- Run this once in the Supabase SQL editor (or `supabase db push`).
-- Safe to re-run: uses IF NOT EXISTS / OR REPLACE / DROP ... IF EXISTS throughout.

create extension if not exists pgcrypto;

-- =========================================================================
-- Cleanup: the old self-serve invite-link system was replaced by direct
-- account creation (lib/accountActions.ts) — drop its now-unused objects.
-- =========================================================================

drop function if exists accept_invite(text);
drop function if exists get_invite_preview(text);
drop table if exists invites;

-- =========================================================================
-- Tables
-- =========================================================================

-- One row per Splitzy account. id == auth.users.id. Auto-created by the
-- handle_new_user trigger below whenever someone signs up (see /login).
create table if not exists profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null default '',
  color text not null default 'from-sky-400 to-cyan-400',
  tags text[] not null default '{}',
  created_at timestamptz not null default now()
);

-- Symmetric friend graph: both (a,b) and (b,a) rows are written together
-- by addFriendAccount() (lib/accountActions.ts, via the service-role client).
-- "My friends" == everyone I have a connections row with.
create table if not exists connections (
  user_id uuid not null references profiles (id) on delete cascade,
  friend_id uuid not null references profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, friend_id)
);

create table if not exists groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  emoji text not null default '🧾',
  created_by uuid not null references profiles (id),
  created_at timestamptz not null default now()
);

-- A named household within a group (a couple/family who settle as one wallet).
-- Scoped to a single group — NOT a permanent link between accounts, so the same
-- person can be solo in one group and part of a couple in another. Membership is
-- tracked by group_members.household_id below; a member with a null household_id
-- is a "single". Balances/settle-ups aggregate per household (lib/balances.ts),
-- while expense_splits stay strictly per person.
create table if not exists households (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups (id) on delete cascade,
  name text not null,
  emoji text not null default '👪',
  created_at timestamptz not null default now()
);

create table if not exists group_members (
  group_id uuid not null references groups (id) on delete cascade,
  person_id uuid not null references profiles (id) on delete cascade,
  -- which household (if any) this member belongs to, within this group.
  -- on delete set null: deleting a household turns its members back into singles.
  household_id uuid references households (id) on delete set null,
  primary key (group_id, person_id)
);

-- Existing installs: add the column if the table predates households.
alter table group_members
  add column if not exists household_id uuid references households (id) on delete set null;

-- 1:1 with a Group's optional hotel-stay booking (GroupStay in lib/types.ts).
create table if not exists group_stays (
  group_id uuid primary key references groups (id) on delete cascade,
  check_in date not null,
  check_out date not null,
  price numeric not null,
  paid_by uuid not null references profiles (id)
);

-- Per-member presence window within a group_stay (Stay in lib/types.ts).
create table if not exists stays (
  group_id uuid not null references groups (id) on delete cascade,
  person_id uuid not null references profiles (id) on delete cascade,
  "from" date not null,
  "to" date not null,
  primary key (group_id, person_id)
);

create table if not exists expenses (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups (id) on delete cascade,
  description text not null,
  emoji text not null default '💸',
  amount numeric not null,
  paid_by uuid not null references profiles (id),
  config jsonb not null,
  category text,
  created_at timestamptz not null default now()
);

create table if not exists expense_splits (
  expense_id uuid not null references expenses (id) on delete cascade,
  person_id uuid not null references profiles (id) on delete cascade,
  amount numeric not null,
  primary key (expense_id, person_id)
);

create table if not exists settlements (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups (id) on delete cascade,
  from_person uuid not null references profiles (id),
  to_person uuid not null references profiles (id),
  amount numeric not null,
  created_at timestamptz not null default now()
);

-- =========================================================================
-- New-user bootstrap
-- =========================================================================

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  palette text[] := array[
    'from-sky-400 to-cyan-400',
    'from-amber-400 to-orange-400',
    'from-rose-400 to-pink-400',
    'from-emerald-400 to-teal-400',
    'from-indigo-400 to-violet-400',
    'from-fuchsia-400 to-pink-500'
  ];
begin
  insert into profiles (id, name, color)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    palette[1 + floor(random() * array_length(palette, 1))::int]
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- =========================================================================
-- RLS helpers
-- =========================================================================

-- security definer so it can be called from other tables' RLS policies
-- without recursively re-checking group_members' own RLS.
create or replace function is_group_member(gid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from group_members
    where group_id = gid and person_id = auth.uid()
  );
$$;

create or replace function is_connected(other uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select other = auth.uid() or exists (
    select 1 from connections
    where user_id = auth.uid() and friend_id = other
  );
$$;

-- security definer for the same reason as is_group_member: a plain inline
-- subquery against `groups` here would be subject to groups_select's own
-- RLS (is_group_member), which is false for a brand-new group that has no
-- group_members row yet — a chicken-and-egg failure that silently blocked
-- the creator from ever adding themselves as the first member.
create or replace function is_group_creator(gid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from groups where id = gid and created_by = auth.uid()
  );
$$;

-- =========================================================================
-- Row level security
-- =========================================================================

alter table profiles enable row level security;
alter table connections enable row level security;
alter table groups enable row level security;
alter table households enable row level security;
alter table group_members enable row level security;
alter table group_stays enable row level security;
alter table stays enable row level security;
alter table expenses enable row level security;
alter table expense_splits enable row level security;
alter table settlements enable row level security;

-- profiles: visible to yourself, your connections, and fellow group members.
-- NOTE (known v1 limitation): update is allowed for connections too, not just
-- self, because the Friends page lets you tag a friend's diet/smoker/drinker
-- profile for auto-split purposes — there's no per-viewer override, so two
-- friends editing the same tag will overwrite each other. Acceptable for v1.
drop policy if exists "profiles_select" on profiles;
create policy "profiles_select" on profiles for select
  using (
    id = auth.uid()
    or is_connected(id)
    or exists (
      select 1 from group_members gm1
      join group_members gm2 on gm1.group_id = gm2.group_id
      where gm1.person_id = auth.uid() and gm2.person_id = profiles.id
    )
  );

drop policy if exists "profiles_update" on profiles;
create policy "profiles_update" on profiles for update
  using (id = auth.uid() or is_connected(id))
  with check (id = auth.uid() or is_connected(id));

-- connections: readable by either side; writes only via the service-role
-- client in addFriendAccount() (lib/accountActions.ts), which bypasses RLS.
drop policy if exists "connections_select" on connections;
create policy "connections_select" on connections for select
  using (user_id = auth.uid() or friend_id = auth.uid());

-- groups
drop policy if exists "groups_select" on groups;
create policy "groups_select" on groups for select
  using (is_group_member(id));

drop policy if exists "groups_insert" on groups;
create policy "groups_insert" on groups for insert
  with check (created_by = auth.uid());

drop policy if exists "groups_update" on groups;
create policy "groups_update" on groups for update
  using (is_group_member(id));

drop policy if exists "groups_delete" on groups;
create policy "groups_delete" on groups for delete
  using (is_group_member(id));

-- households: fully managed by any member of the owning group.
drop policy if exists "households_all" on households;
create policy "households_all" on households for all
  using (is_group_member(group_id)) with check (is_group_member(group_id));

-- group_members: a member can add another *connection* to the group;
-- the creator can add themself right after creating the group (before any
-- group_members row exists yet, so is_group_member() would still say false).
drop policy if exists "group_members_select" on group_members;
create policy "group_members_select" on group_members for select
  using (is_group_member(group_id));

drop policy if exists "group_members_insert" on group_members;
create policy "group_members_insert" on group_members for insert
  with check (
    (person_id = auth.uid() and is_group_creator(group_id))
    or (is_group_member(group_id) and is_connected(person_id))
  );

-- update is needed to (re)assign a member's household_id; any group member may.
drop policy if exists "group_members_update" on group_members;
create policy "group_members_update" on group_members for update
  using (is_group_member(group_id)) with check (is_group_member(group_id));

drop policy if exists "group_members_delete" on group_members;
create policy "group_members_delete" on group_members for delete
  using (is_group_member(group_id));

-- group_stays / stays / expenses / settlements: gated by group membership.
drop policy if exists "group_stays_all" on group_stays;
create policy "group_stays_all" on group_stays for all
  using (is_group_member(group_id)) with check (is_group_member(group_id));

drop policy if exists "stays_all" on stays;
create policy "stays_all" on stays for all
  using (is_group_member(group_id)) with check (is_group_member(group_id));

drop policy if exists "expenses_all" on expenses;
create policy "expenses_all" on expenses for all
  using (is_group_member(group_id)) with check (is_group_member(group_id));

drop policy if exists "settlements_all" on settlements;
create policy "settlements_all" on settlements for all
  using (is_group_member(group_id)) with check (is_group_member(group_id));

-- expense_splits: gated via its parent expense's group.
drop policy if exists "expense_splits_all" on expense_splits;
create policy "expense_splits_all" on expense_splits for all
  using (exists (
    select 1 from expenses e where e.id = expense_id and is_group_member(e.group_id)
  ))
  with check (exists (
    select 1 from expenses e where e.id = expense_id and is_group_member(e.group_id)
  ));

-- =========================================================================
-- Realtime: expose the group-scoped tables to postgres_changes
-- subscriptions (used by lib/store.tsx to sync across devices/friends).
-- =========================================================================

do $$
declare
  t text;
begin
  foreach t in array array[
    'groups', 'households', 'group_members', 'group_stays', 'stays',
    'expenses', 'expense_splits', 'settlements', 'connections', 'profiles'
  ]
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table %I', t);
    end if;
  end loop;
end;
$$;
