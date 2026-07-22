"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import {
  groupNet,
  simplifyDebts,
  grossFlows,
  groupStats,
  householdNet,
  householdFlows,
  householdStats,
} from "@/lib/balances";
import { computeNights, describeSplit, METHOD_EMOJI, nightsBetween } from "@/lib/split";
import { money, relativeTime } from "@/lib/format";
import type { Group, Expense, Household, Person, Settlement } from "@/lib/types";
import { Avatar, AvatarStack } from "@/components/Avatar";
import { ButtonLink } from "@/components/Button";
import { AddFriendForm } from "@/components/AddFriendForm";
import { Loading, NotFound } from "@/components/Screen";

const GROUP_EMOJIS = ["🏖️", "🏨", "🏠", "✈️", "🎉", "⛰️", "🏀", "🎓", "💼", "🚗", "🍻", "🎁", "🧾"];

export default function GroupPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { state, person, hydrated, deleteGroup, updateGroup } = useStore();
  const [tab, setTab] = useState<"expenses" | "balances">("expenses");
  const [menu, setMenu] = useState(false);
  const [editingGroup, setEditingGroup] = useState(false);

  const group = state.groups.find((g) => g.id === id);
  if (!group) return hydrated ? <NotFound what="group" /> : <Loading />;

  const removeGroup = () => {
    if (confirm(`Delete "${group.name}" and all its expenses? This can't be undone.`)) {
      deleteGroup(group.id);
      router.push("/");
    }
  };

  const expenses = state.expenses
    .filter((e) => e.groupId === id)
    .sort((a, b) => b.createdAt - a.createdAt);
  const settlements = state.settlements.filter((s) => s.groupId === id);
  const net = groupNet(group, expenses, settlements);
  const myNet = net[state.meId] ?? 0;
  const members = group.memberIds.map(person);

  return (
    <main className="flex flex-1 flex-col">
      {/* Header */}
      <header className="safe-top sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-bg/80 px-4 pb-3 pt-3 backdrop-blur-xl">
        <button
          onClick={() => router.push("/")}
          className="grid h-10 w-10 place-items-center rounded-full bg-surface text-foreground shadow-sm active:scale-90"
          aria-label="Back"
        >
          <BackIcon />
        </button>
        <span className="grid h-10 w-10 place-items-center rounded-2xl bg-surface-2 text-xl">
          {group.emoji}
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-extrabold leading-tight">{group.name}</h1>
          <p className="text-xs font-semibold text-muted">
            {members.length} members
          </p>
        </div>
        <AvatarStack people={members} />
        <div className="relative">
          <button
            onClick={() => setMenu((v) => !v)}
            aria-label="Group options"
            className="grid h-10 w-10 place-items-center rounded-full bg-surface text-foreground shadow-sm active:scale-90"
          >
            <DotsIcon />
          </button>
          {menu && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setMenu(false)} />
              <div className="animate-pop absolute right-0 top-12 z-40 w-48 overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl">
                <button
                  onClick={() => {
                    setMenu(false);
                    setEditingGroup(true);
                  }}
                  className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-bold hover:bg-surface-2"
                >
                  ✏️ Edit group
                </button>
                {group.stay && (
                  <Link
                    href={`/groups/${group.id}/stay`}
                    onClick={() => setMenu(false)}
                    className="flex items-center gap-2 border-t border-border px-4 py-3 text-sm font-bold hover:bg-surface-2"
                  >
                    🏨 Manage stay
                  </Link>
                )}
                <button
                  onClick={() => {
                    setMenu(false);
                    removeGroup();
                  }}
                  className="flex w-full items-center gap-2 border-t border-border px-4 py-3 text-left text-sm font-bold text-negative hover:bg-negative-soft"
                >
                  <TrashIcon /> Delete group
                </button>
              </div>
            </>
          )}
        </div>
      </header>

      <div className="flex flex-col gap-5 px-5 pt-5">
        {editingGroup && (
          <GroupEditor
            group={group}
            onSave={(patch) => {
              updateGroup(group.id, patch);
              setEditingGroup(false);
            }}
            onCancel={() => setEditingGroup(false)}
          />
        )}

        {/* Your balance */}
        <section
          className={`animate-pop rounded-4xl p-5 text-white shadow-(--shadow) ${
            Math.abs(myNet) < 0.005
              ? "bg-linear-to-br from-slate-500 to-slate-600"
              : myNet > 0
                ? "bg-linear-to-br from-positive to-emerald-500"
                : "bg-linear-to-br from-negative to-rose-500"
          }`}
        >
          <p className="text-sm font-semibold text-white/85">
            {Math.abs(myNet) < 0.005
              ? "You're settled up in this group"
              : myNet > 0
                ? "You are owed"
                : "You owe"}
          </p>
          <p className="mt-1 text-3xl font-black">{money(Math.abs(myNet))}</p>
        </section>

        {/* Hotel stay card */}
        {group.stay && <StayCard group={group} />}

        {/* Members */}
        <MembersRow group={group} net={net} />

        {/* Households — group couples/families so they settle as one */}
        <HouseholdsSection group={group} />

        {/* Tabs */}
        <div className="flex gap-1 rounded-full bg-surface-2 p-1">
          {(["expenses", "balances"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 rounded-full py-2.5 text-sm font-bold capitalize transition-all ${
                tab === t
                  ? "bg-surface text-foreground shadow-sm"
                  : "text-muted"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {tab === "expenses" ? (
          <ExpensesTab groupId={id} />
        ) : (
          <BalancesTab
            groupId={id}
            group={group}
            expenses={expenses}
            settlements={settlements}
            net={net}
            households={group.households ?? []}
          />
        )}
      </div>

      {/* Floating add button */}
      <ButtonLink
        href={`/groups/${id}/add`}
        size="lg"
        className="safe-bottom fixed inset-x-0 bottom-24 z-30 mx-auto w-[calc(100%-2.5rem)] max-w-md shadow-2xl shadow-primary/30"
      >
        <PlusIcon /> Add expense
      </ButtonLink>
      <div className="h-24" />
    </main>
  );
}

function GroupEditor({
  group,
  onSave,
  onCancel,
}: {
  group: Group;
  onSave: (patch: { name?: string; emoji?: string }) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(group.name);
  const [emoji, setEmoji] = useState(group.emoji);

  const commit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const patch: { name?: string; emoji?: string } = {};
    if (trimmed !== group.name) patch.name = trimmed;
    if (emoji !== group.emoji) patch.emoji = emoji;
    onSave(patch);
  };

  return (
    <div className="animate-pop flex flex-col gap-3 rounded-3xl border border-border bg-surface p-4 shadow-sm">
      <p className="text-sm font-bold text-muted">Edit group</p>
      <div className="flex items-center gap-3">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-surface-2 text-2xl">
          {emoji}
        </span>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && commit()}
          className="min-w-0 flex-1 rounded-2xl bg-surface-2 px-4 py-2.5 text-base font-extrabold outline-none"
        />
      </div>
      <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
        {GROUP_EMOJIS.map((em) => (
          <button
            key={em}
            onClick={() => setEmoji(em)}
            className={`grid h-10 w-10 shrink-0 place-items-center rounded-full text-lg transition-all ${
              emoji === em ? "bg-primary-soft ring-2 ring-primary" : "bg-surface-2"
            }`}
          >
            {em}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={commit}
          disabled={!name.trim()}
          className="flex-1 rounded-full bg-primary py-2.5 text-sm font-bold text-white active:scale-95 disabled:opacity-40"
        >
          Save
        </button>
        <button onClick={onCancel} className="px-3 text-xs font-bold text-muted active:scale-95">
          Cancel
        </button>
      </div>
    </div>
  );
}

function StayCard({ group }: { group: Group }) {
  const { state } = useStore();
  const stay = group.stay!;
  const nights = nightsBetween(stay.checkIn, stay.checkOut);
  const splits = computeNights(stay.price, stay.checkIn, stay.checkOut, stay.stays);
  const myShare = splits.find((s) => s.personId === state.meId)?.amount ?? 0;
  const fmt = (d: string) =>
    new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
  return (
    <Link
      href={`/groups/${group.id}/stay`}
      className="flex items-center gap-4 rounded-3xl border border-border bg-surface p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
    >
      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-surface-2 text-xl">
        🏨
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-extrabold">Hotel stay</p>
        <p className="text-xs font-semibold text-muted">
          {fmt(stay.checkIn)} → {fmt(stay.checkOut)} · {nights} nights · {money(stay.price)}
        </p>
        <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-primary-soft px-2 py-0.5 text-[10px] font-bold text-primary">
          🌙 Your share {money(myShare)}
        </span>
      </div>
      <span className="text-xs font-bold text-primary">Manage →</span>
    </Link>
  );
}

function MembersRow({ group, net }: { group: Group; net: Record<string, number> }) {
  const { state, person, addMemberToGroup, removeMemberFromGroup } = useStore();
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const available = state.people.filter((p) => !group.memberIds.includes(p.id));

  const removeMember = (pid: string) => {
    if (group.memberIds.length <= 1) {
      alert("A group needs at least one member — delete the group instead.");
      return;
    }
    if (Math.abs(net[pid] ?? 0) >= 0.005) {
      alert(
        `${pid === state.meId ? "You" : person(pid).name} still ${
          (net[pid] ?? 0) > 0 ? "are owed money" : "owe money"
        } in this group. Settle up first.`,
      );
      return;
    }
    const label = pid === state.meId ? "leave this group" : `remove ${person(pid).name}`;
    if (!confirm(`Are you sure you want to ${label}?`)) return;
    removeMemberFromGroup(group.id, pid);
    if (pid === state.meId) router.push("/");
  };

  // Staying groups add members (with dates) on the dedicated stay screen;
  // removal there happens on that same screen (per-member nights live there).
  if (group.stay) {
    return (
      <div className="flex items-center gap-3 rounded-3xl border border-border bg-surface p-3.5 shadow-sm">
        <AvatarStack people={group.memberIds.map(person)} max={5} />
        <span className="flex-1 text-sm font-bold text-muted">
          {group.memberIds.length} members
        </span>
        <ButtonLink href={`/groups/${group.id}/stay`} variant="soft" className="h-9! px-4! text-xs">
          + Add / edit stay
        </ButtonLink>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-3xl border border-border bg-surface p-3.5 shadow-sm">
      <div className="flex items-center gap-3">
        <AvatarStack people={group.memberIds.map(person)} max={5} />
        <span className="flex-1 text-sm font-bold text-muted">
          {group.memberIds.length} members
        </span>
        <button
          onClick={() => setExpanded((v) => !v)}
          className="rounded-full bg-primary-soft px-3 py-1.5 text-xs font-bold text-primary active:scale-95"
        >
          {expanded ? "Done" : "Manage"}
        </button>
      </div>
      {expanded && (
        <div className="flex flex-col gap-3 border-t border-border pt-3">
          <div className="flex flex-wrap gap-2">
            {group.memberIds.map((pid) => (
              <span
                key={pid}
                className="flex items-center gap-1.5 rounded-full bg-surface-2 py-1 pl-1 pr-2 text-sm font-bold"
              >
                <Avatar person={person(pid)} size="sm" />
                {pid === state.meId ? "You" : person(pid).name}
                <button
                  onClick={() => removeMember(pid)}
                  aria-label={pid === state.meId ? "Leave group" : "Remove member"}
                  className="grid h-5 w-5 place-items-center rounded-full text-muted hover:bg-negative-soft hover:text-negative"
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
          {available.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {available.map((p) => (
                <button
                  key={p.id}
                  onClick={() => addMemberToGroup(group.id, p.id)}
                  className="flex items-center gap-2 rounded-full bg-surface-2 py-1.5 pl-1.5 pr-4 text-sm font-bold active:scale-95"
                >
                  <Avatar person={p} size="sm" />
                  {p.name}
                </button>
              ))}
            </div>
          )}
          <AddFriendForm groupId={group.id} label="Add someone new to this group" />
        </div>
      )}
    </div>
  );
}

function ExpensesTab({ groupId }: { groupId: string }) {
  const { state, person, deleteExpense } = useStore();
  const expenses = state.expenses
    .filter((e) => e.groupId === groupId)
    .sort((a, b) => b.createdAt - a.createdAt);

  if (expenses.length === 0)
    return (
      <div className="rounded-3xl border border-dashed border-border bg-surface/60 p-8 text-center">
        <p className="text-4xl">🧾</p>
        <p className="mt-2 font-bold">No expenses yet</p>
        <p className="mt-1 text-sm text-muted">Add your first shared bill.</p>
      </div>
    );

  return (
    <ul className="flex flex-col gap-3">
      {expenses.map((e) => {
        const payer = person(e.paidBy);
        const myShare =
          e.splits.find((s) => s.personId === state.meId)?.amount ?? 0;
        const iPaid = e.paidBy === state.meId;
        // what this expense did to my balance
        const delta = (iPaid ? e.amount : 0) - myShare;
        return (
          <li
            key={e.id}
            className="group flex items-center gap-1 rounded-3xl border border-border bg-surface p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
          >
            <Link
              href={`/groups/${groupId}/add?edit=${e.id}`}
              className="flex min-w-0 flex-1 items-center gap-3"
            >
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-surface-2 text-xl">
                {e.emoji}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold">{e.description}</p>
                <p className="text-xs font-semibold text-muted">
                  {iPaid ? "You" : payer.name} paid {money(e.amount)} ·{" "}
                  {relativeTime(e.createdAt)}
                </p>
                {(() => {
                  const perHH = e.config.method === "equal" && e.config.perHousehold;
                  if (e.config.method === "equal" && !perHH) return null;
                  return (
                    <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-bold text-muted">
                      {perHH ? "👪" : METHOD_EMOJI[e.config.method]} {describeSplit(e.config)}
                    </span>
                  );
                })()}
              </div>
              <div className="text-right">
                {Math.abs(delta) < 0.005 ? (
                  <span className="text-xs font-bold text-muted">—</span>
                ) : (
                  <>
                    <p className={`text-[11px] font-bold ${delta > 0 ? "text-positive" : "text-negative"}`}>
                      {delta > 0 ? "you lent" : "you owe"}
                    </p>
                    <p className={`font-black ${delta > 0 ? "text-positive" : "text-negative"}`}>
                      {money(Math.abs(delta))}
                    </p>
                  </>
                )}
              </div>
            </Link>
            <button
              onClick={() => {
                if (confirm(`Delete "${e.description}"?`)) deleteExpense(e.id);
              }}
              aria-label="Delete expense"
              className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted opacity-0 transition-opacity hover:bg-negative-soft hover:text-negative group-hover:opacity-100"
            >
              <TrashIcon />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function BalancesTab({
  groupId,
  group,
  expenses,
  settlements,
  net,
  households,
}: {
  groupId: string;
  group: Group;
  expenses: Expense[];
  settlements: Settlement[];
  net: Record<string, number>;
  households: Household[];
}) {
  const { state, person } = useStore();
  const [autoBalance, setAutoBalance] = useState(true);
  const hasHouseholds = households.length > 0;
  const [byHousehold, setByHousehold] = useState(hasHouseholds);
  const grouped = hasHouseholds && byHousehold;

  // In household mode, collapse every per-person figure into per-unit figures.
  const netView = grouped ? householdNet(net, households) : net;
  const simplified = simplifyDebts(netView);
  const grossPerson = grossFlows(group, expenses, settlements);
  const gross = grouped ? householdFlows(grossPerson, households) : grossPerson;
  const flows = autoBalance ? simplified : gross;

  const statsAll = groupStats(group, expenses);
  const stats = grouped ? householdStats(statsAll, households) : statsAll;
  const topPayer = stats.reduce(
    (best, s) => (s.paid > best.paid ? s : best),
    stats[0] ?? { personId: "", paid: 0, share: 0 },
  );
  const topPayerId = topPayer.paid > 0.005 ? topPayer.personId : "";
  const anySpend = stats.some((s) => s.paid > 0.005 || s.share > 0.005);

  // ordered list of units for the balances/stats rows
  const inHousehold = new Set(households.flatMap((h) => h.memberIds));
  const singleIds = group.memberIds.filter((pid) => !inHousehold.has(pid));
  const balanceUnits = grouped ? [...households.map((h) => h.id), ...singleIds] : group.memberIds;

  const hById = (id: string) => households.find((h) => h.id === id);
  const unitName = (id: string) => hById(id)?.name || (id === state.meId ? "You" : person(id).name);
  const unitHasMe = (id: string) => {
    const h = hById(id);
    return h ? h.memberIds.includes(state.meId) : id === state.meId;
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Per-person / per-household toggle */}
      {hasHouseholds && (
        <div className="grid grid-cols-2 gap-1 rounded-full bg-surface-2 p-1">
          {(
            [
              [true, "👪 Per household"],
              [false, "🧑 Per person"],
            ] as const
          ).map(([val, label]) => (
            <button
              key={label}
              onClick={() => setByHousehold(val)}
              className={`rounded-full py-2 text-sm font-bold transition-all ${
                byHousehold === val ? "bg-surface text-foreground shadow-sm" : "text-muted"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Auto-balance / gross toggle */}
      <section className="flex flex-col gap-2">
        <div className="grid grid-cols-2 gap-1 rounded-full bg-surface-2 p-1">
          {(
            [
              [true, "⚖️ Auto-balanced"],
              [false, "📋 Detailed"],
            ] as const
          ).map(([val, label]) => (
            <button
              key={label}
              onClick={() => setAutoBalance(val)}
              className={`rounded-full py-2 text-sm font-bold transition-all ${
                autoBalance === val ? "bg-surface text-foreground shadow-sm" : "text-muted"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="px-1 text-[11px] font-semibold text-muted">
          {autoBalance
            ? grouped
              ? "Debts netted down to the fewest payments between households."
              : "Debts netted down to the fewest payments."
            : "Every debt shown in full — offsetting amounts aren't cancelled out."}
        </p>
      </section>

      {/* Flows list */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between px-1">
          <h3 className="font-extrabold">{autoBalance ? "Suggested settle-ups" : "Who owes whom"}</h3>
          {simplified.length > 0 && (
            <ButtonLink href={`/groups/${groupId}/settle`} variant="soft" size="md" className="h-9! px-4! text-xs">
              Settle up
            </ButtonLink>
          )}
        </div>

        {flows.length === 0 ? (
          <div className="rounded-3xl border border-border bg-positive-soft p-6 text-center">
            <p className="text-3xl">✅</p>
            <p className="mt-2 font-bold text-positive">
              {anySpend ? "Everyone's settled up!" : "No debts yet"}
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {flows.map((t, i) => {
              const involvesMe = unitHasMe(t.from) || unitHasMe(t.to);
              return (
                <li
                  key={i}
                  className={`flex items-center gap-3 rounded-3xl border p-4 shadow-sm ${
                    involvesMe ? "border-primary/30 bg-primary-soft" : "border-border bg-surface"
                  }`}
                >
                  <UnitFace id={t.from} households={households} person={person} size="sm" />
                  <div className="flex flex-1 items-center gap-2 text-sm font-bold">
                    <span>{unitName(t.from)}</span>
                    <ArrowIcon />
                    <span>{unitName(t.to)}</span>
                  </div>
                  <UnitFace id={t.to} households={households} person={person} size="sm" />
                  <span className="ml-1 font-black">{money(t.amount)}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Per-unit net */}
      <section className="flex flex-col gap-3">
        <h3 className="px-1 font-extrabold">{grouped ? "Household balances" : "Group balances"}</h3>
        <ul className="flex flex-col gap-2.5">
          {balanceUnits.map((uid) => {
            const v = netView[uid] ?? 0;
            const settled = Math.abs(v) < 0.005;
            const h = hById(uid);
            return (
              <li
                key={uid}
                className="flex items-center gap-3 rounded-3xl border border-border bg-surface p-3.5 shadow-sm"
              >
                <UnitFace id={uid} households={households} person={person} size="md" />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-bold">{unitName(uid)}</span>
                  {h && (
                    <span className="truncate text-[11px] font-semibold text-muted">
                      {h.memberIds.map((m) => (m === state.meId ? "You" : person(m).name)).join(", ")}
                    </span>
                  )}
                </div>
                <span
                  className={`font-black ${
                    settled ? "text-muted" : v > 0 ? "text-positive" : "text-negative"
                  }`}
                >
                  {settled ? "settled" : (v > 0 ? "+" : "-") + money(Math.abs(v))}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Stats — paid vs share per unit */}
      {anySpend && (
        <section className="flex flex-col gap-3">
          <h3 className="px-1 font-extrabold">Group stats</h3>
          <div className="rounded-3xl border border-border bg-surface p-2 shadow-sm">
            <div className="flex items-center gap-3 px-2 pb-1.5 pt-1 text-[10px] font-bold uppercase tracking-wide text-muted">
              <span className="flex-1">{grouped ? "Household" : "Member"}</span>
              <span className="w-20 text-right">Paid</span>
              <span className="w-20 text-right">Share</span>
            </div>
            <ul className="flex flex-col">
              {stats.map((s) => {
                const isTopPayer = s.personId === topPayerId && s.paid > 0.005;
                return (
                  <li key={s.personId} className="flex items-center gap-3 rounded-2xl px-2 py-2.5">
                    <UnitFace id={s.personId} households={households} person={person} size="sm" />
                    <span className="flex min-w-0 flex-1 items-center gap-1.5">
                      <span className="truncate font-bold">{unitName(s.personId)}</span>
                      {isTopPayer && (
                        <span className="shrink-0 rounded-full bg-primary-soft px-2 py-0.5 text-[10px] font-bold text-primary">
                          🏆 Top payer
                        </span>
                      )}
                    </span>
                    <span className="w-20 text-right font-black tabular-nums">{money(s.paid)}</span>
                    <span className="w-20 text-right font-bold tabular-nums text-muted">
                      {money(s.share)}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
          <p className="px-1 text-[11px] font-semibold text-muted">
            Paid = what they fronted · Share = their portion of the bills.
          </p>
        </section>
      )}
    </div>
  );
}

/** Avatar for a "unit": a household shows its emoji tile, a person their avatar. */
function UnitFace({
  id,
  households,
  person,
  size,
}: {
  id: string;
  households: Household[];
  person: (id: string) => Person;
  size: "sm" | "md";
}) {
  const h = households.find((x) => x.id === id);
  if (h) {
    const box = size === "md" ? "h-10 w-10 text-xl" : "h-9 w-9 text-lg";
    return (
      <span className={`grid shrink-0 place-items-center rounded-2xl bg-surface-2 ${box}`}>
        {h.emoji}
      </span>
    );
  }
  return <Avatar person={person(id)} size={size} />;
}

/* ---------- households management ---------- */

const HOUSEHOLD_EMOJIS = ["💑", "👪", "🧑‍🤝‍🧑", "👨‍👩‍👧", "👩‍👧", "🏠", "❤️", "🐣"];

function HouseholdsSection({ group }: { group: Group }) {
  const { state, person, createHousehold, updateHousehold, setMemberHousehold, deleteHousehold } =
    useStore();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmoji, setNewEmoji] = useState(HOUSEHOLD_EMOJIS[0]);

  const households = group.households ?? [];
  const inHousehold = new Set(households.flatMap((h) => h.memberIds));
  const singleIds = group.memberIds.filter((pid) => !inHousehold.has(pid));
  const name = (pid: string) => (pid === state.meId ? "You" : person(pid).name);

  const startCreate = () => {
    setCreating(true);
    setNewName("");
    setNewEmoji(HOUSEHOLD_EMOJIS[0]);
  };
  const commitCreate = () => {
    const label = newName.trim();
    if (!label) return;
    createHousehold(group.id, { name: label, emoji: newEmoji, memberIds: [] });
    setCreating(false);
    setNewName("");
  };

  const summary =
    households.length === 0
      ? "Group couples & families so they settle as one"
      : `${households.length} household${households.length > 1 ? "s" : ""} · ${singleIds.length} single${
          singleIds.length === 1 ? "" : "s"
        }`;

  return (
    <div className="flex flex-col gap-3 rounded-3xl border border-border bg-surface p-3.5 shadow-sm">
      <button onClick={() => setOpen((v) => !v)} className="flex items-center gap-3 text-left">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-surface-2 text-xl">
          👪
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-extrabold leading-tight">Households</p>
          <p className="truncate text-[11px] font-semibold text-muted">{summary}</p>
        </div>
        <span className={`text-muted transition-transform ${open ? "rotate-90" : ""}`}>›</span>
      </button>

      {open && (
        <div className="flex flex-col gap-3 border-t border-border pt-3">
          {households.map((h) => (
            <HouseholdCard
              key={h.id}
              household={h}
              singleIds={singleIds}
              meId={state.meId}
              person={person}
              onRename={(patch) => updateHousehold(group.id, h.id, patch)}
              onToggleMember={(pid, on) =>
                setMemberHousehold(group.id, pid, on ? h.id : null)
              }
              onDelete={() => {
                if (confirm(`Disband "${h.name}"? Its members become singles again.`))
                  deleteHousehold(group.id, h.id);
              }}
            />
          ))}

          {/* create a new household */}
          {creating ? (
            <div className="flex flex-col gap-2 rounded-2xl border border-dashed border-border bg-surface/50 p-3">
              <div className="no-scrollbar flex gap-1.5 overflow-x-auto pb-1">
                {HOUSEHOLD_EMOJIS.map((em) => (
                  <button
                    key={em}
                    onClick={() => setNewEmoji(em)}
                    className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-lg transition-all ${
                      newEmoji === em ? "bg-primary-soft ring-2 ring-primary" : "bg-surface-2"
                    }`}
                  >
                    {em}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <input
                  autoFocus
                  placeholder="Household name (e.g. The Sharmas)"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && commitCreate()}
                  className="min-w-0 flex-1 rounded-full bg-surface-2 px-4 py-2 text-sm font-bold outline-none placeholder:font-semibold placeholder:text-muted"
                />
                <button
                  onClick={commitCreate}
                  disabled={!newName.trim()}
                  className="rounded-full bg-primary px-4 py-2 text-sm font-bold text-white active:scale-95 disabled:opacity-40"
                >
                  Create
                </button>
                <button
                  onClick={() => setCreating(false)}
                  className="px-1 text-xs font-bold text-muted active:scale-95"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={startCreate}
              className="rounded-2xl border border-dashed border-border bg-surface/50 py-3 text-sm font-bold text-primary active:scale-[0.99]"
            >
              ＋ New household
            </button>
          )}

          {/* singles */}
          <div className="flex flex-col gap-1.5">
            <p className="px-1 text-[11px] font-bold uppercase tracking-wide text-muted">
              Singles
            </p>
            {singleIds.length === 0 ? (
              <p className="px-1 text-xs font-semibold text-muted">Everyone is in a household.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {singleIds.map((pid) => (
                  <span
                    key={pid}
                    className="flex items-center gap-1.5 rounded-full bg-surface-2 py-1 pl-1 pr-3 text-xs font-bold"
                  >
                    <Avatar person={person(pid)} size="sm" />
                    {name(pid)}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function HouseholdCard({
  household,
  singleIds,
  meId,
  person,
  onRename,
  onToggleMember,
  onDelete,
}: {
  household: Household;
  /** members not in any household — candidates to add here */
  singleIds: string[];
  meId: string;
  person: (id: string) => Person;
  onRename: (patch: { name?: string; emoji?: string }) => void;
  onToggleMember: (personId: string, on: boolean) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(household.name);
  const name = (pid: string) => (pid === meId ? "You" : person(pid).name);
  const memberSet = new Set(household.memberIds);
  // this household's own members (to remove) plus any singles (to add in)
  const assignable = [...household.memberIds, ...singleIds];

  const commitName = () => {
    const v = draft.trim();
    if (v && v !== household.name) onRename({ name: v });
    setEditing(false);
  };

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-border bg-surface-2/40 p-3">
      <div className="flex items-center gap-2">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl bg-surface text-lg">
          {household.emoji}
        </span>
        {editing ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => e.key === "Enter" && commitName()}
            className="min-w-0 flex-1 rounded-full bg-surface px-3 py-1.5 text-sm font-bold outline-none"
          />
        ) : (
          <button
            onClick={() => {
              setDraft(household.name);
              setEditing(true);
            }}
            className="min-w-0 flex-1 truncate text-left font-extrabold"
          >
            {household.name}
          </button>
        )}
        <button
          onClick={onDelete}
          aria-label="Disband household"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted hover:bg-negative-soft hover:text-negative"
        >
          <TrashIcon />
        </button>
      </div>

      {editing && (
        <div className="no-scrollbar flex gap-1.5 overflow-x-auto pb-1">
          {HOUSEHOLD_EMOJIS.map((em) => (
            <button
              key={em}
              onClick={() => onRename({ emoji: em })}
              className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-base transition-all ${
                household.emoji === em ? "bg-primary-soft ring-2 ring-primary" : "bg-surface"
              }`}
            >
              {em}
            </button>
          ))}
        </div>
      )}

      {/* member chips — tap to add/remove from this household */}
      <div className="flex flex-wrap gap-1.5">
        {assignable.map((pid) => {
          const on = memberSet.has(pid);
          return (
            <button
              key={pid}
              onClick={() => onToggleMember(pid, !on)}
              className={`flex items-center gap-1.5 rounded-full py-1 pl-1 pr-3 text-xs font-bold transition-all ${
                on ? "bg-primary-soft text-primary ring-1 ring-primary/30" : "bg-surface text-muted opacity-70"
              }`}
            >
              <Avatar person={person(pid)} size="sm" />
              {name(pid)}
              {on && <span className="text-primary/60">✕</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function BackIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 12H5M12 19l-7-7 7-7" />
    </svg>
  );
}
function DotsIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <circle cx="12" cy="5" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="12" cy="19" r="1.8" />
    </svg>
  );
}
function ArrowIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="text-muted">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}
function PlusIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
function TrashIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    </svg>
  );
}
