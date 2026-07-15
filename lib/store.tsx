"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type {
  AppState,
  Expense,
  Group,
  GroupStay,
  Person,
  Settlement,
} from "./types";
import { createClient } from "./supabase/client";
import { signUpAccount } from "./accountActions";

const EMPTY_STATE: AppState = {
  meId: "",
  meEmail: "",
  people: [],
  groups: [],
  expenses: [],
  settlements: [],
};

type ProfileRow = { id: string; name: string; color: string; tags: string[] | null };
const toPerson = (row: ProfileRow): Person => ({
  id: row.id,
  name: row.name,
  color: row.color,
  tags: row.tags ?? [],
});

/** Supabase calls resolve (not reject) on RLS/DB errors — throw explicitly
 * so multi-step writes stop instead of silently continuing past a failure. */
function unwrap({ error }: { error: { message: string } | null }): void {
  if (error) throw new Error(error.message);
}

type Store = {
  state: AppState;
  /** true once the initial auth check + data load has finished */
  hydrated: boolean;
  me: Person;
  person: (id: string) => Person;
  /** signs in on the same client instance the rest of the app reads from,
   * so state repopulates immediately instead of needing a hard refresh */
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  /** self-serve signup: creates the account (no email), then signs in */
  signUp: (
    name: string,
    email: string,
    password: string,
  ) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  addGroup: (data: {
    name: string;
    emoji: string;
    memberIds: string[];
    stay?: GroupStay;
  }) => Group;
  toggleTag: (personId: string, tag: string) => void;
  /** edit your own display name */
  updateMyProfile: (patch: { name?: string }) => void;
  /** add a person (an existing connection) to a group; for staying groups, give them a presence window */
  addMemberToGroup: (
    groupId: string,
    personId: string,
    stayDates?: { from: string; to: string },
  ) => void;
  updateStay: (groupId: string, patch: Partial<GroupStay>) => void;
  setMemberStay: (
    groupId: string,
    personId: string,
    dates: { from: string; to: string },
  ) => void;
  addExpense: (data: Omit<Expense, "id" | "createdAt">) => Expense;
  updateExpense: (id: string, data: Omit<Expense, "id" | "createdAt">) => void;
  addSettlement: (data: Omit<Settlement, "id" | "createdAt">) => Settlement;
  deleteExpense: (id: string) => void;
  deleteGroup: (id: string) => void;
};

const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const supabase = useMemo(() => createClient(), []);
  const [state, setState] = useState<AppState>(EMPTY_STATE);
  const [hydrated, setHydrated] = useState(false);
  const [toasts, setToasts] = useState<{ id: string; message: string }[]>([]);

  /** Surfaces a persistence failure as a dismissible toast instead of letting
   * it vanish into the console — the optimistic local update already happened,
   * so the user needs to know the server never got it. */
  const pushError = useCallback((action: string, err: unknown) => {
    console.error(`${action} failed:`, err);
    const id = crypto.randomUUID();
    const detail = err instanceof Error ? err.message : String(err);
    setToasts((t) => [...t, { id, message: `Couldn't ${action}. ${detail}` }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 6000);
  }, []);

  const load = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setState(EMPTY_STATE);
      setHydrated(true);
      return;
    }

    const [{ data: me }, { data: conns }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
      supabase.from("connections").select("friend_id").eq("user_id", user.id),
    ]);
    if (!me) {
      // profile row not created yet (trigger race right after signup) — retry on next event
      setHydrated(true);
      return;
    }

    const friendIds = (conns ?? []).map((c) => c.friend_id);
    const { data: friendProfiles } = friendIds.length
      ? await supabase.from("profiles").select("*").in("id", friendIds)
      : { data: [] as ProfileRow[] };

    const people = [me as ProfileRow, ...((friendProfiles as ProfileRow[]) ?? [])].map(toPerson);

    const { data: memberships } = await supabase
      .from("group_members")
      .select(
        `group:groups(
          id, name, emoji, created_at,
          group_members(person_id),
          group_stays(check_in, check_out, price, paid_by),
          stays(person_id, from, to),
          expenses(id, description, emoji, amount, paid_by, config, category, created_at,
            expense_splits(person_id, amount)),
          settlements(id, from_person, to_person, amount, created_at)
        )`,
      )
      .eq("person_id", user.id);

    const groups: Group[] = [];
    const expenses: Expense[] = [];
    const settlements: Settlement[] = [];

    for (const row of (memberships ?? []) as unknown as { group: Record<string, unknown> | null }[]) {
      const g = row.group;
      if (!g) continue;
      // group_stays.group_id is a primary key (strict 1:1), so PostgREST
      // embeds it as a single object (or null) — not an array like the
      // other one-to-many embeds below.
      const groupStay = g.group_stays as {
        check_in: string;
        check_out: string;
        price: number;
        paid_by: string;
      } | null;
      const staysRows = g.stays as Array<{ person_id: string; from: string; to: string }>;

      groups.push({
        id: g.id as string,
        name: g.name as string,
        emoji: g.emoji as string,
        memberIds: (g.group_members as Array<{ person_id: string }>).map((m) => m.person_id),
        createdAt: new Date(g.created_at as string).getTime(),
        ...(groupStay
          ? {
              stay: {
                checkIn: groupStay.check_in,
                checkOut: groupStay.check_out,
                price: Number(groupStay.price),
                paidBy: groupStay.paid_by,
                stays: staysRows.map((s) => ({
                  personId: s.person_id,
                  from: s.from,
                  to: s.to,
                })),
              },
            }
          : {}),
      });

      for (const e of g.expenses as Array<Record<string, unknown>>) {
        expenses.push({
          id: e.id as string,
          groupId: g.id as string,
          description: e.description as string,
          emoji: e.emoji as string,
          amount: Number(e.amount),
          paidBy: e.paid_by as string,
          config: e.config as Expense["config"],
          category: (e.category as string | null) ?? undefined,
          createdAt: new Date(e.created_at as string).getTime(),
          splits: (e.expense_splits as Array<{ person_id: string; amount: number }>).map((s) => ({
            personId: s.person_id,
            amount: Number(s.amount),
          })),
        });
      }

      for (const s of g.settlements as Array<Record<string, unknown>>) {
        settlements.push({
          id: s.id as string,
          groupId: g.id as string,
          from: s.from_person as string,
          to: s.to_person as string,
          amount: Number(s.amount),
          createdAt: new Date(s.created_at as string).getTime(),
        });
      }
    }

    setState({ meId: user.id, meEmail: user.email ?? "", people, groups, expenses, settlements });
    setHydrated(true);
  }, [supabase]);

  useEffect(() => {
    load();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => load());
    return () => subscription.unsubscribe();
  }, [load, supabase]);

  // Live sync: any change to a group-scoped table triggers a refetch. Simple
  // and correct for a friends-scale app; a future pass could scope channels
  // per group_id instead of reloading everything.
  useEffect(() => {
    if (!state.meId) return;
    const tables = [
      "groups",
      "group_members",
      "group_stays",
      "stays",
      "expenses",
      "expense_splits",
      "settlements",
      "connections",
      "profiles",
    ];
    const channel = supabase.channel("splitzy-sync");
    for (const table of tables) {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        () => load(),
      );
    }
    channel.subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [state.meId, supabase, load]);

  const store = useMemo<Store>(() => {
    const person = (id: string) =>
      state.people.find((p) => p.id === id) ?? {
        id,
        name: "Unknown",
        color: "from-slate-400 to-slate-500",
        tags: [],
      };

    const signIn: Store["signIn"] = async (email, password) => {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (!error) await load();
      return { error: error?.message ?? null };
    };

    const signUp: Store["signUp"] = async (name, email, password) => {
      const { error } = await signUpAccount({ name, email, password });
      if (error) return { error };
      // account created (no email) — sign in on this client so state populates
      return signIn(email, password);
    };

    const signOut: Store["signOut"] = async () => {
      await supabase.auth.signOut();
      setState(EMPTY_STATE);
    };

    const addGroup: Store["addGroup"] = ({ name, emoji, memberIds, stay }) => {
      const id = crypto.randomUUID();
      const allMemberIds = Array.from(new Set([state.meId, ...memberIds]));
      const group: Group = {
        id,
        name,
        emoji,
        memberIds: allMemberIds,
        createdAt: Date.now(),
        ...(stay ? { stay } : {}),
      };
      setState((s) => ({ ...s, groups: [group, ...s.groups] }));

      (async () => {
        unwrap(await supabase.from("groups").insert({ id, name, emoji, created_by: state.meId }));
        unwrap(
          await supabase.from("group_members").insert({ group_id: id, person_id: state.meId }),
        );
        const others = allMemberIds.filter((pid) => pid !== state.meId);
        if (others.length) {
          unwrap(
            await supabase
              .from("group_members")
              .insert(others.map((person_id) => ({ group_id: id, person_id }))),
          );
        }
        if (stay) {
          unwrap(
            await supabase.from("group_stays").insert({
              group_id: id,
              check_in: stay.checkIn,
              check_out: stay.checkOut,
              price: stay.price,
              paid_by: stay.paidBy,
            }),
          );
          unwrap(
            await supabase.from("stays").insert(
              stay.stays.map((s) => ({
                group_id: id,
                person_id: s.personId,
                from: s.from,
                to: s.to,
              })),
            ),
          );
        }
      })().catch((err) => pushError("create the group", err));

      return group;
    };

    const addMemberToGroup: Store["addMemberToGroup"] = (groupId, personId, stayDates) => {
      setState((s) => ({
        ...s,
        groups: s.groups.map((g) => {
          if (g.id !== groupId || g.memberIds.includes(personId)) return g;
          const next: Group = { ...g, memberIds: [...g.memberIds, personId] };
          if (g.stay) {
            const dates = stayDates ?? { from: g.stay.checkIn, to: g.stay.checkOut };
            next.stay = {
              ...g.stay,
              stays: [
                ...g.stay.stays.filter((st) => st.personId !== personId),
                { personId, from: dates.from, to: dates.to },
              ],
            };
          }
          return next;
        }),
      }));

      (async () => {
        unwrap(
          await supabase.from("group_members").insert({ group_id: groupId, person_id: personId }),
        );
        const group = state.groups.find((g) => g.id === groupId);
        if (group?.stay) {
          const dates = stayDates ?? { from: group.stay.checkIn, to: group.stay.checkOut };
          unwrap(
            await supabase
              .from("stays")
              .upsert(
                { group_id: groupId, person_id: personId, from: dates.from, to: dates.to },
                { onConflict: "group_id,person_id" },
              ),
          );
        }
      })().catch((err) => pushError("add them to the group", err));
    };

    const updateStay: Store["updateStay"] = (groupId, patch) => {
      setState((s) => ({
        ...s,
        groups: s.groups.map((g) =>
          g.id === groupId && g.stay ? { ...g, stay: { ...g.stay, ...patch } } : g,
        ),
      }));

      const dbPatch: Record<string, unknown> = {};
      if (patch.checkIn !== undefined) dbPatch.check_in = patch.checkIn;
      if (patch.checkOut !== undefined) dbPatch.check_out = patch.checkOut;
      if (patch.price !== undefined) dbPatch.price = patch.price;
      if (patch.paidBy !== undefined) dbPatch.paid_by = patch.paidBy;

      supabase
        .from("group_stays")
        .update(dbPatch)
        .eq("group_id", groupId)
        .then(({ error }) => error && pushError("update the stay", new Error(error.message)));
    };

    const setMemberStay: Store["setMemberStay"] = (groupId, personId, dates) => {
      setState((s) => ({
        ...s,
        groups: s.groups.map((g) => {
          if (g.id !== groupId || !g.stay) return g;
          const has = g.stay.stays.some((st) => st.personId === personId);
          const stays = has
            ? g.stay.stays.map((st) => (st.personId === personId ? { ...st, ...dates } : st))
            : [...g.stay.stays, { personId, ...dates }];
          return { ...g, stay: { ...g.stay, stays } };
        }),
      }));

      supabase
        .from("stays")
        .upsert(
          { group_id: groupId, person_id: personId, from: dates.from, to: dates.to },
          { onConflict: "group_id,person_id" },
        )
        .then(({ error }) => error && pushError("update their dates", new Error(error.message)));
    };

    const toggleTag: Store["toggleTag"] = (personId, tag) => {
      const current = person(personId).tags;
      const next = current.includes(tag)
        ? current.filter((t) => t !== tag)
        : [...current, tag];

      setState((s) => ({
        ...s,
        people: s.people.map((p) => (p.id === personId ? { ...p, tags: next } : p)),
      }));

      supabase
        .from("profiles")
        .update({ tags: next })
        .eq("id", personId)
        .then(({ error }) => error && pushError("update that tag", new Error(error.message)));
    };

    const updateMyProfile: Store["updateMyProfile"] = (patch) => {
      setState((s) => ({
        ...s,
        people: s.people.map((p) => (p.id === s.meId ? { ...p, ...patch } : p)),
      }));

      supabase
        .from("profiles")
        .update(patch)
        .eq("id", state.meId)
        .then(({ error }) => error && pushError("update your profile", new Error(error.message)));
    };

    const addExpense: Store["addExpense"] = (data) => {
      const e: Expense = { ...data, id: crypto.randomUUID(), createdAt: Date.now() };
      setState((s) => ({ ...s, expenses: [e, ...s.expenses] }));

      (async () => {
        unwrap(
          await supabase.from("expenses").insert({
            id: e.id,
            group_id: e.groupId,
            description: e.description,
            emoji: e.emoji,
            amount: e.amount,
            paid_by: e.paidBy,
            config: e.config,
            category: e.category ?? null,
          }),
        );
        unwrap(
          await supabase.from("expense_splits").insert(
            e.splits.map((s) => ({ expense_id: e.id, person_id: s.personId, amount: s.amount })),
          ),
        );
      })().catch((err) => pushError("save the expense", err));

      return e;
    };

    const updateExpense: Store["updateExpense"] = (id, data) => {
      setState((s) => ({
        ...s,
        expenses: s.expenses.map((e) => (e.id === id ? { ...e, ...data } : e)),
      }));

      (async () => {
        unwrap(
          await supabase
            .from("expenses")
            .update({
              group_id: data.groupId,
              description: data.description,
              emoji: data.emoji,
              amount: data.amount,
              paid_by: data.paidBy,
              config: data.config,
              category: data.category ?? null,
            })
            .eq("id", id),
        );
        unwrap(await supabase.from("expense_splits").delete().eq("expense_id", id));
        unwrap(
          await supabase.from("expense_splits").insert(
            data.splits.map((s) => ({ expense_id: id, person_id: s.personId, amount: s.amount })),
          ),
        );
      })().catch((err) => pushError("save the expense", err));
    };

    const addSettlement: Store["addSettlement"] = (data) => {
      const s0: Settlement = { ...data, id: crypto.randomUUID(), createdAt: Date.now() };
      setState((s) => ({ ...s, settlements: [s0, ...s.settlements] }));

      supabase
        .from("settlements")
        .insert({
          id: s0.id,
          group_id: s0.groupId,
          from_person: s0.from,
          to_person: s0.to,
          amount: s0.amount,
        })
        .then(({ error }) => error && pushError("record the settlement", new Error(error.message)));

      return s0;
    };

    const deleteExpense: Store["deleteExpense"] = (id) => {
      setState((s) => ({ ...s, expenses: s.expenses.filter((e) => e.id !== id) }));
      supabase
        .from("expenses")
        .delete()
        .eq("id", id)
        .then(({ error }) => error && pushError("delete the expense", new Error(error.message)));
    };

    const deleteGroup: Store["deleteGroup"] = (id) => {
      setState((s) => ({
        ...s,
        groups: s.groups.filter((g) => g.id !== id),
        expenses: s.expenses.filter((e) => e.groupId !== id),
        settlements: s.settlements.filter((x) => x.groupId !== id),
      }));
      supabase
        .from("groups")
        .delete()
        .eq("id", id)
        .then(({ error }) => error && pushError("delete the group", new Error(error.message)));
    };

    return {
      state,
      hydrated,
      me: person(state.meId),
      person,
      signIn,
      signUp,
      signOut,
      addGroup,
      toggleTag,
      updateMyProfile,
      addMemberToGroup,
      updateStay,
      setMemberStay,
      addExpense,
      updateExpense,
      addSettlement,
      deleteExpense,
      deleteGroup,
    };
  }, [state, hydrated, supabase, load, pushError]);

  return (
    <StoreContext.Provider value={store}>
      {children}
      <div className="safe-top pointer-events-none fixed inset-x-0 top-0 z-50 flex flex-col items-center gap-2 px-4 pt-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="animate-pop pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-3xl border border-negative/30 bg-surface p-4 shadow-lg shadow-negative/10"
          >
            <span className="text-lg">⚠️</span>
            <p className="flex-1 text-sm font-semibold text-foreground">{t.message}</p>
            <button
              onClick={() => setToasts((cur) => cur.filter((x) => x.id !== t.id))}
              aria-label="Dismiss"
              className="text-muted"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </StoreContext.Provider>
  );
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}
