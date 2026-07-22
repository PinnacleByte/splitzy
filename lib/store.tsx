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
  Household,
  Person,
  Settlement,
} from "./types";
import { createClient } from "./supabase/client";
import { signUpAccount } from "./accountActions";

const EMPTY_STATE: AppState = {
  meId: "",
  meEmail: "",
  people: [],
  connectionIds: [],
  groups: [],
  expenses: [],
  settlements: [],
};

type ProfileRow = {
  id: string;
  name: string;
  color: string;
  tags: string[] | null;
  is_placeholder: boolean | null;
};
const toPerson = (row: ProfileRow): Person => ({
  id: row.id,
  name: row.name,
  color: row.color,
  tags: row.tags ?? [],
  isPlaceholder: row.is_placeholder ?? false,
});

/** Supabase calls resolve (not reject) on RLS/DB errors — throw explicitly
 * so multi-step writes stop instead of silently continuing past a failure. */
function unwrap({ error }: { error: { message: string } | null }): void {
  if (error) throw new Error(error.message);
}

/**
 * Whether an error is a transient network failure (dropped/interrupted
 * connection — common on mobile: weak signal, the tab backgrounded mid-request,
 * a WiFi↔cellular handoff) rather than a genuine application error (RLS
 * violation, bad input, conflict). postgrest-js catches a failed `fetch()` and
 * *resolves* with `error: { message: "<Name>: <reason>" }` instead of
 * rejecting — every browser's fetch() rejects network failures with a
 * TypeError specifically (per the fetch spec, e.g. Safari's "Load failed",
 * Chrome's "Failed to fetch"), so that name prefix reliably tells "the
 * request never reached the server" apart from a real Postgrest error, whose
 * messages read like SQL/RLS text and never start with an error-name prefix.
 */
function isRetryableNetworkError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return message.startsWith("TypeError:");
}

/**
 * Retries a Supabase call a couple of times (short backoff) when it fails with
 * a transient network error, instead of giving up on the first dropped
 * connection. Application errors (RLS, validation, conflicts) are not
 * network-shaped and fail immediately without wasted delay.
 */
async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i >= attempts - 1 || !isRetryableNetworkError(err)) throw err;
      await new Promise((resolve) => setTimeout(resolve, 400 * 2 ** i));
    }
  }
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
    /** pre-populate households at creation time (e.g. a "family trip" wizard
     *  where each family is its own unit from the start) */
    households?: { name: string; emoji: string; memberIds: string[] }[];
  }) => Group;
  /** rename / re-emoji a group */
  updateGroup: (groupId: string, patch: { name?: string; emoji?: string }) => void;
  toggleTag: (personId: string, tag: string) => void;
  /** edit your own display name */
  updateMyProfile: (patch: { name?: string }) => void;
  /** add a person (an existing connection) to a group; for staying groups, give them a presence window */
  addMemberToGroup: (
    groupId: string,
    personId: string,
    stayDates?: { from: string; to: string },
  ) => void;
  /** create a household (couple/family) in a group and move `memberIds` into it */
  createHousehold: (
    groupId: string,
    data: { name: string; emoji: string; memberIds: string[] },
  ) => Household;
  /** rename / re-emoji a household */
  updateHousehold: (
    groupId: string,
    householdId: string,
    patch: { name?: string; emoji?: string },
  ) => void;
  /** move a member into a household, or pass null to make them a single again */
  setMemberHousehold: (
    groupId: string,
    personId: string,
    householdId: string | null,
  ) => void;
  /** disband a household — its members become singles again */
  deleteHousehold: (groupId: string, householdId: string) => void;
  /** remove a member from a group (also works to leave a group yourself) */
  removeMemberFromGroup: (groupId: string, personId: string) => void;
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
  deleteSettlement: (id: string) => void;
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

    const [{ data: me }, { data: conns }, { data: memberships }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
      supabase.from("connections").select("friend_id").eq("user_id", user.id),
      supabase
        .from("group_members")
        .select(
          `group:groups(
            id, name, emoji, created_at,
            group_members(person_id, household_id),
            households(id, name, emoji),
            group_stays(check_in, check_out, price, paid_by),
            stays(person_id, from, to),
            expenses(id, description, emoji, amount, paid_by, config, category, created_at,
              expense_splits(person_id, amount)),
            settlements(id, from_person, to_person, amount, created_at)
          )`,
        )
        .eq("person_id", user.id),
    ]);
    if (!me) {
      // profile row not created yet (trigger race right after signup) — retry on next event
      setHydrated(true);
      return;
    }

    const friendIds = (conns ?? []).map((c) => c.friend_id);

    const groups: Group[] = [];
    const expenses: Expense[] = [];
    const settlements: Settlement[] = [];

    // Everyone who shares a group with me, across every group — RLS already
    // permits viewing their profile (see the "fellow group members" clause in
    // profiles_select, supabase/schema.sql), but until now this only ever
    // fetched direct connections' profiles, so a co-member who wasn't also a
    // direct friend rendered as a fallback "Unknown" avatar and never showed
    // up in the Friends list, even though they're actively splitting bills.
    const coMemberIds = new Set<string>();

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
      const memberRows = g.group_members as Array<{ person_id: string; household_id: string | null }>;
      const householdRows = (g.households as Array<{ id: string; name: string; emoji: string }>) ?? [];
      const households = householdRows.map((h) => ({
        id: h.id,
        name: h.name,
        emoji: h.emoji,
        memberIds: memberRows.filter((m) => m.household_id === h.id).map((m) => m.person_id),
      }));

      for (const m of memberRows) coMemberIds.add(m.person_id);

      groups.push({
        id: g.id as string,
        name: g.name as string,
        emoji: g.emoji as string,
        memberIds: memberRows.map((m) => m.person_id),
        households,
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

    const otherIds = Array.from(new Set([...friendIds, ...coMemberIds])).filter(
      (id) => id !== user.id,
    );
    const { data: otherProfiles } = otherIds.length
      ? await supabase.from("profiles").select("*").in("id", otherIds)
      : { data: [] as ProfileRow[] };

    const people = [me as ProfileRow, ...((otherProfiles as ProfileRow[]) ?? [])].map(toPerson);

    setState({
      meId: user.id,
      meEmail: user.email ?? "",
      people,
      connectionIds: friendIds,
      groups,
      expenses,
      settlements,
    });
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

    const addGroup: Store["addGroup"] = ({ name, emoji, memberIds, stay, households }) => {
      const id = crypto.randomUUID();
      const allMemberIds = Array.from(new Set([state.meId, ...memberIds]));
      const householdRecords: Household[] = (households ?? []).map((h) => ({
        id: crypto.randomUUID(),
        name: h.name,
        emoji: h.emoji,
        memberIds: h.memberIds,
      }));
      const householdIdFor = (pid: string) =>
        householdRecords.find((h) => h.memberIds.includes(pid))?.id ?? null;

      const group: Group = {
        id,
        name,
        emoji,
        memberIds: allMemberIds,
        createdAt: Date.now(),
        ...(householdRecords.length ? { households: householdRecords } : {}),
        ...(stay ? { stay } : {}),
      };
      setState((s) => ({ ...s, groups: [group, ...s.groups] }));

      withRetry(async () => {
        unwrap(await supabase.from("groups").insert({ id, name, emoji, created_by: state.meId }));
        // The creator's own row must exist before anything else: households_all
        // and the "others" group_members insert below both require
        // is_group_member(group_id), which is false until this row exists (the
        // same chicken-and-egg is_group_creator already solves for this exact
        // insert). household_id can't be set yet either — households
        // themselves don't exist until the next step — so it's patched in
        // afterward if the creator belongs to one.
        unwrap(
          await supabase
            .from("group_members")
            .insert({ group_id: id, person_id: state.meId, household_id: null }),
        );
        if (householdRecords.length) {
          unwrap(
            await supabase.from("households").insert(
              householdRecords.map((h) => ({ id: h.id, group_id: id, name: h.name, emoji: h.emoji })),
            ),
          );
          const myHousehold = householdIdFor(state.meId);
          if (myHousehold) {
            unwrap(
              await supabase
                .from("group_members")
                .update({ household_id: myHousehold })
                .eq("group_id", id)
                .eq("person_id", state.meId),
            );
          }
        }
        const others = allMemberIds.filter((pid) => pid !== state.meId);
        if (others.length) {
          unwrap(
            await supabase.from("group_members").insert(
              others.map((person_id) => ({
                group_id: id,
                person_id,
                household_id: householdIdFor(person_id),
              })),
            ),
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
      }).catch((err) => {
        setState((s) => ({ ...s, groups: s.groups.filter((g) => g.id !== id) }));
        pushError("create the group", err);
      });

      return group;
    };

    const updateGroup: Store["updateGroup"] = (groupId, patch) => {
      if (Object.keys(patch).length === 0) return;
      const prior = state.groups.find((g) => g.id === groupId);
      const revert: { name?: string; emoji?: string } = {};
      if (prior && patch.name !== undefined) revert.name = prior.name;
      if (prior && patch.emoji !== undefined) revert.emoji = prior.emoji;

      setState((s) => ({
        ...s,
        groups: s.groups.map((g) => (g.id === groupId ? { ...g, ...patch } : g)),
      }));

      withRetry(async () => unwrap(await supabase.from("groups").update(patch).eq("id", groupId))).catch(
        (err) => {
          setState((s) => ({
            ...s,
            groups: s.groups.map((g) => (g.id === groupId ? { ...g, ...revert } : g)),
          }));
          pushError("update the group", err);
        },
      );
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

      withRetry(async () => {
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
      }).catch((err) => {
        setState((s) => ({
          ...s,
          groups: s.groups.map((g) => {
            if (g.id !== groupId) return g;
            const next: Group = { ...g, memberIds: g.memberIds.filter((m) => m !== personId) };
            if (g.stay) {
              next.stay = { ...g.stay, stays: g.stay.stays.filter((st) => st.personId !== personId) };
            }
            return next;
          }),
        }));
        pushError("add them to the group", err);
      });
    };

    const createHousehold: Store["createHousehold"] = (groupId, { name, emoji, memberIds }) => {
      const id = crypto.randomUUID();
      const household: Household = { id, name, emoji, memberIds };
      const priorHouseholds = state.groups.find((g) => g.id === groupId)?.households ?? [];

      setState((s) => ({
        ...s,
        groups: s.groups.map((g) => {
          if (g.id !== groupId) return g;
          // pull these members out of any household they were already in
          const others = (g.households ?? []).map((h) => ({
            ...h,
            memberIds: h.memberIds.filter((m) => !memberIds.includes(m)),
          }));
          return { ...g, households: [...others, household] };
        }),
      }));

      withRetry(async () => {
        unwrap(await supabase.from("households").insert({ id, group_id: groupId, name, emoji }));
        if (memberIds.length) {
          unwrap(
            await supabase
              .from("group_members")
              .update({ household_id: id })
              .eq("group_id", groupId)
              .in("person_id", memberIds),
          );
        }
      }).catch((err) => {
        setState((s) => ({
          ...s,
          groups: s.groups.map((g) => (g.id === groupId ? { ...g, households: priorHouseholds } : g)),
        }));
        pushError("create the household", err);
      });

      return household;
    };

    const updateHousehold: Store["updateHousehold"] = (groupId, householdId, patch) => {
      const prior = state.groups.find((g) => g.id === groupId)?.households?.find((h) => h.id === householdId);
      const revert: { name?: string; emoji?: string } = {};
      if (prior && patch.name !== undefined) revert.name = prior.name;
      if (prior && patch.emoji !== undefined) revert.emoji = prior.emoji;

      setState((s) => ({
        ...s,
        groups: s.groups.map((g) =>
          g.id === groupId
            ? {
                ...g,
                households: (g.households ?? []).map((h) =>
                  h.id === householdId ? { ...h, ...patch } : h,
                ),
              }
            : g,
        ),
      }));

      withRetry(async () =>
        unwrap(await supabase.from("households").update(patch).eq("id", householdId)),
      ).catch((err) => {
        setState((s) => ({
          ...s,
          groups: s.groups.map((g) =>
            g.id === groupId
              ? {
                  ...g,
                  households: (g.households ?? []).map((h) =>
                    h.id === householdId ? { ...h, ...revert } : h,
                  ),
                }
              : g,
          ),
        }));
        pushError("rename the household", err);
      });
    };

    const setMemberHousehold: Store["setMemberHousehold"] = (groupId, personId, householdId) => {
      const priorHouseholdId =
        state.groups.find((g) => g.id === groupId)?.households?.find((h) => h.memberIds.includes(personId))
          ?.id ?? null;

      setState((s) => ({
        ...s,
        groups: s.groups.map((g) => {
          if (g.id !== groupId) return g;
          const households = (g.households ?? []).map((h) => ({
            ...h,
            memberIds:
              h.id === householdId
                ? Array.from(new Set([...h.memberIds, personId]))
                : h.memberIds.filter((m) => m !== personId),
          }));
          return { ...g, households };
        }),
      }));

      withRetry(async () =>
        unwrap(
          await supabase
            .from("group_members")
            .update({ household_id: householdId })
            .eq("group_id", groupId)
            .eq("person_id", personId),
        ),
      ).catch((err) => {
        setState((s) => ({
          ...s,
          groups: s.groups.map((g) => {
            if (g.id !== groupId) return g;
            const households = (g.households ?? []).map((h) => ({
              ...h,
              memberIds:
                h.id === priorHouseholdId
                  ? Array.from(new Set([...h.memberIds, personId]))
                  : h.memberIds.filter((m) => m !== personId),
            }));
            return { ...g, households };
          }),
        }));
        pushError("update the household", err);
      });
    };

    const deleteHousehold: Store["deleteHousehold"] = (groupId, householdId) => {
      const prior = state.groups.find((g) => g.id === groupId)?.households?.find((h) => h.id === householdId);

      setState((s) => ({
        ...s,
        groups: s.groups.map((g) =>
          g.id === groupId
            ? { ...g, households: (g.households ?? []).filter((h) => h.id !== householdId) }
            : g,
        ),
      }));

      // FK `on delete set null` resets the members' household_id automatically.
      withRetry(async () => unwrap(await supabase.from("households").delete().eq("id", householdId))).catch(
        (err) => {
          if (prior) {
            setState((s) => ({
              ...s,
              groups: s.groups.map((g) =>
                g.id === groupId && !(g.households ?? []).some((h) => h.id === householdId)
                  ? { ...g, households: [...(g.households ?? []), prior] }
                  : g,
              ),
            }));
          }
          pushError("disband the household", err);
        },
      );
    };

    const removeMemberFromGroup: Store["removeMemberFromGroup"] = (groupId, personId) => {
      const priorGroup = state.groups.find((g) => g.id === groupId);
      const priorHouseholdId = priorGroup?.households?.find((h) => h.memberIds.includes(personId))?.id;
      const priorStay = priorGroup?.stay?.stays.find((st) => st.personId === personId);

      setState((s) => ({
        ...s,
        groups: s.groups.map((g) => {
          if (g.id !== groupId) return g;
          const next: Group = { ...g, memberIds: g.memberIds.filter((m) => m !== personId) };
          if (g.households?.length) {
            next.households = g.households.map((h) => ({
              ...h,
              memberIds: h.memberIds.filter((m) => m !== personId),
            }));
          }
          if (g.stay) {
            next.stay = { ...g.stay, stays: g.stay.stays.filter((st) => st.personId !== personId) };
          }
          return next;
        }),
      }));

      withRetry(async () => {
        // stays has its own row per (group, person) — not cleaned up by any FK
        // when group_members is deleted, so it needs an explicit delete too.
        unwrap(
          await supabase.from("stays").delete().eq("group_id", groupId).eq("person_id", personId),
        );
        unwrap(
          await supabase
            .from("group_members")
            .delete()
            .eq("group_id", groupId)
            .eq("person_id", personId),
        );
      }).catch((err) => {
        setState((s) => ({
          ...s,
          groups: s.groups.map((g) => {
            if (g.id !== groupId || g.memberIds.includes(personId)) return g;
            const next: Group = { ...g, memberIds: [...g.memberIds, personId] };
            if (priorHouseholdId && g.households?.length) {
              next.households = g.households.map((h) =>
                h.id === priorHouseholdId ? { ...h, memberIds: [...h.memberIds, personId] } : h,
              );
            }
            if (g.stay && priorStay) {
              next.stay = { ...g.stay, stays: [...g.stay.stays, priorStay] };
            }
            return next;
          }),
        }));
        pushError("remove them from the group", err);
      });
    };

    const updateStay: Store["updateStay"] = (groupId, patch) => {
      const priorStay = state.groups.find((g) => g.id === groupId)?.stay;
      const revert: Partial<GroupStay> = {};
      if (priorStay) {
        if (patch.checkIn !== undefined) revert.checkIn = priorStay.checkIn;
        if (patch.checkOut !== undefined) revert.checkOut = priorStay.checkOut;
        if (patch.price !== undefined) revert.price = priorStay.price;
        if (patch.paidBy !== undefined) revert.paidBy = priorStay.paidBy;
      }

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

      withRetry(async () =>
        unwrap(await supabase.from("group_stays").update(dbPatch).eq("group_id", groupId)),
      ).catch((err) => {
        setState((s) => ({
          ...s,
          groups: s.groups.map((g) =>
            g.id === groupId && g.stay ? { ...g, stay: { ...g.stay, ...revert } } : g,
          ),
        }));
        pushError("update the stay", err);
      });
    };

    const setMemberStay: Store["setMemberStay"] = (groupId, personId, dates) => {
      const priorGroup = state.groups.find((g) => g.id === groupId);
      const priorEntry = priorGroup?.stay?.stays.find((st) => st.personId === personId);
      const hadEntry = !!priorEntry;

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

      withRetry(async () =>
        unwrap(
          await supabase
            .from("stays")
            .upsert(
              { group_id: groupId, person_id: personId, from: dates.from, to: dates.to },
              { onConflict: "group_id,person_id" },
            ),
        ),
      ).catch((err) => {
        setState((s) => ({
          ...s,
          groups: s.groups.map((g) => {
            if (g.id !== groupId || !g.stay) return g;
            const stays = hadEntry
              ? g.stay.stays.map((st) => (st.personId === personId ? priorEntry! : st))
              : g.stay.stays.filter((st) => st.personId !== personId);
            return { ...g, stay: { ...g.stay, stays } };
          }),
        }));
        pushError("update their dates", err);
      });
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

      withRetry(async () =>
        unwrap(await supabase.from("profiles").update({ tags: next }).eq("id", personId)),
      ).catch((err) => {
        setState((s) => ({
          ...s,
          people: s.people.map((p) => (p.id === personId ? { ...p, tags: current } : p)),
        }));
        pushError("update that tag", err);
      });
    };

    const updateMyProfile: Store["updateMyProfile"] = (patch) => {
      const prior = person(state.meId);
      const revert: { name?: string } = {};
      if (patch.name !== undefined) revert.name = prior.name;

      setState((s) => ({
        ...s,
        people: s.people.map((p) => (p.id === s.meId ? { ...p, ...patch } : p)),
      }));

      withRetry(async () => unwrap(await supabase.from("profiles").update(patch).eq("id", state.meId))).catch(
        (err) => {
          setState((s) => ({
            ...s,
            people: s.people.map((p) => (p.id === state.meId ? { ...p, ...revert } : p)),
          }));
          pushError("update your profile", err);
        },
      );
    };

    const addExpense: Store["addExpense"] = (data) => {
      const e: Expense = { ...data, id: crypto.randomUUID(), createdAt: Date.now() };
      setState((s) => ({ ...s, expenses: [e, ...s.expenses] }));

      withRetry(async () => {
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
      }).catch((err) => {
        // the save never landed — undo the optimistic add so the list doesn't
        // keep showing an expense that only exists in this tab
        setState((s) => ({ ...s, expenses: s.expenses.filter((x) => x.id !== e.id) }));
        pushError("save the expense", err);
      });

      return e;
    };

    const updateExpense: Store["updateExpense"] = (id, data) => {
      const prior = state.expenses.find((e) => e.id === id);

      setState((s) => ({
        ...s,
        expenses: s.expenses.map((e) => (e.id === id ? { ...e, ...data } : e)),
      }));

      withRetry(async () => {
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
      }).catch((err) => {
        if (prior) setState((s) => ({ ...s, expenses: s.expenses.map((e) => (e.id === id ? prior : e)) }));
        pushError("save the expense", err);
      });
    };

    const addSettlement: Store["addSettlement"] = (data) => {
      const s0: Settlement = { ...data, id: crypto.randomUUID(), createdAt: Date.now() };
      setState((s) => ({ ...s, settlements: [s0, ...s.settlements] }));

      withRetry(async () =>
        unwrap(
          await supabase.from("settlements").insert({
            id: s0.id,
            group_id: s0.groupId,
            from_person: s0.from,
            to_person: s0.to,
            amount: s0.amount,
          }),
        ),
      ).catch((err) => {
        setState((s) => ({ ...s, settlements: s.settlements.filter((x) => x.id !== s0.id) }));
        pushError("record the settlement", err);
      });

      return s0;
    };

    const deleteExpense: Store["deleteExpense"] = (id) => {
      const prior = state.expenses.find((e) => e.id === id);
      setState((s) => ({ ...s, expenses: s.expenses.filter((e) => e.id !== id) }));

      withRetry(async () => unwrap(await supabase.from("expenses").delete().eq("id", id))).catch((err) => {
        if (prior) {
          setState((s) => ({
            ...s,
            expenses: s.expenses.some((e) => e.id === id) ? s.expenses : [prior, ...s.expenses],
          }));
        }
        pushError("delete the expense", err);
      });
    };

    const deleteGroup: Store["deleteGroup"] = (id) => {
      const priorGroup = state.groups.find((g) => g.id === id);
      const priorExpenses = state.expenses.filter((e) => e.groupId === id);
      const priorSettlements = state.settlements.filter((x) => x.groupId === id);

      setState((s) => ({
        ...s,
        groups: s.groups.filter((g) => g.id !== id),
        expenses: s.expenses.filter((e) => e.groupId !== id),
        settlements: s.settlements.filter((x) => x.groupId !== id),
      }));

      withRetry(async () => unwrap(await supabase.from("groups").delete().eq("id", id))).catch((err) => {
        if (priorGroup) {
          setState((s) => ({
            ...s,
            groups: s.groups.some((g) => g.id === id) ? s.groups : [priorGroup, ...s.groups],
            expenses: [
              ...s.expenses,
              ...priorExpenses.filter((e) => !s.expenses.some((x) => x.id === e.id)),
            ],
            settlements: [
              ...s.settlements,
              ...priorSettlements.filter((x) => !s.settlements.some((y) => y.id === x.id)),
            ],
          }));
        }
        pushError("delete the group", err);
      });
    };

    const deleteSettlement: Store["deleteSettlement"] = (id) => {
      const prior = state.settlements.find((x) => x.id === id);
      setState((s) => ({ ...s, settlements: s.settlements.filter((x) => x.id !== id) }));

      withRetry(async () => unwrap(await supabase.from("settlements").delete().eq("id", id))).catch(
        (err) => {
          if (prior) {
            setState((s) => ({
              ...s,
              settlements: s.settlements.some((x) => x.id === id)
                ? s.settlements
                : [prior, ...s.settlements],
            }));
          }
          pushError("undo the settlement", err);
        },
      );
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
      updateGroup,
      toggleTag,
      updateMyProfile,
      addMemberToGroup,
      createHousehold,
      updateHousehold,
      setMemberHousehold,
      deleteHousehold,
      removeMemberFromGroup,
      updateStay,
      setMemberStay,
      addExpense,
      updateExpense,
      addSettlement,
      deleteExpense,
      deleteGroup,
      deleteSettlement,
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
