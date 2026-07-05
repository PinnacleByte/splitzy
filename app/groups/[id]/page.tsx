"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { groupNet, simplifyDebts } from "@/lib/balances";
import { computeNights, describeSplit, METHOD_EMOJI, nightsBetween } from "@/lib/split";
import { money, relativeTime } from "@/lib/format";
import type { Group } from "@/lib/types";
import { Avatar, AvatarStack } from "@/components/Avatar";
import { ButtonLink } from "@/components/Button";
import { InviteButton } from "@/components/InviteButton";
import { Loading, NotFound } from "@/components/Screen";

export default function GroupPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { state, person, hydrated, deleteGroup } = useStore();
  const [tab, setTab] = useState<"expenses" | "balances">("expenses");
  const [menu, setMenu] = useState(false);

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
                {group.stay && (
                  <Link
                    href={`/groups/${group.id}/stay`}
                    onClick={() => setMenu(false)}
                    className="flex items-center gap-2 px-4 py-3 text-sm font-bold hover:bg-surface-2"
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
        {/* Your balance */}
        <section
          className={`animate-pop rounded-4xl p-5 text-white shadow-[var(--shadow)] ${
            Math.abs(myNet) < 0.005
              ? "bg-gradient-to-br from-slate-500 to-slate-600"
              : myNet > 0
                ? "bg-gradient-to-br from-positive to-emerald-500"
                : "bg-gradient-to-br from-negative to-rose-500"
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
        <MembersRow group={group} />

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
          <BalancesTab groupId={id} net={net} />
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

function MembersRow({ group }: { group: Group }) {
  const { state, person, addMemberToGroup } = useStore();
  const [adding, setAdding] = useState(false);
  const available = state.people.filter((p) => !group.memberIds.includes(p.id));

  // Staying groups add members (with dates) on the dedicated stay screen.
  if (group.stay) {
    return (
      <div className="flex items-center gap-3 rounded-3xl border border-border bg-surface p-3.5 shadow-sm">
        <AvatarStack people={group.memberIds.map(person)} max={5} />
        <span className="flex-1 text-sm font-bold text-muted">
          {group.memberIds.length} members
        </span>
        <ButtonLink href={`/groups/${group.id}/stay`} variant="soft" className="!h-9 !px-4 text-xs">
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
          onClick={() => setAdding((v) => !v)}
          className="rounded-full bg-primary-soft px-3 py-1.5 text-xs font-bold text-primary active:scale-95"
        >
          + Add member
        </button>
      </div>
      {adding && (
        <div className="flex flex-col gap-2 border-t border-border pt-2">
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
          <InviteButton groupId={group.id} label="Invite someone new to this group" />
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
                {e.config.method !== "equal" && (
                  <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-bold text-muted">
                    {METHOD_EMOJI[e.config.method]} {describeSplit(e.config)}
                  </span>
                )}
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
  net,
}: {
  groupId: string;
  net: Record<string, number>;
}) {
  const { state, person } = useStore();
  const transfers = simplifyDebts(net);

  return (
    <div className="flex flex-col gap-5">
      {/* Suggested settle-ups */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between px-1">
          <h3 className="font-extrabold">Suggested settle-ups</h3>
          {transfers.length > 0 && (
            <ButtonLink href={`/groups/${groupId}/settle`} variant="soft" size="md" className="!h-9 !px-4 text-xs">
              Settle up
            </ButtonLink>
          )}
        </div>

        {transfers.length === 0 ? (
          <div className="rounded-3xl border border-border bg-positive-soft p-6 text-center">
            <p className="text-3xl">✅</p>
            <p className="mt-2 font-bold text-positive">Everyone's settled up!</p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {transfers.map((t, i) => {
              const from = person(t.from);
              const to = person(t.to);
              const involvesMe =
                t.from === state.meId || t.to === state.meId;
              return (
                <li
                  key={i}
                  className={`flex items-center gap-3 rounded-3xl border p-4 shadow-sm ${
                    involvesMe
                      ? "border-primary/30 bg-primary-soft"
                      : "border-border bg-surface"
                  }`}
                >
                  <Avatar person={from} size="sm" />
                  <div className="flex flex-1 items-center gap-2 text-sm font-bold">
                    <span>{t.from === state.meId ? "You" : from.name}</span>
                    <ArrowIcon />
                    <span>{t.to === state.meId ? "You" : to.name}</span>
                  </div>
                  <Avatar person={to} size="sm" />
                  <span className="ml-1 font-black">{money(t.amount)}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Per-member net */}
      <section className="flex flex-col gap-3">
        <h3 className="px-1 font-extrabold">Group balances</h3>
        <ul className="flex flex-col gap-2.5">
          {state.groups
            .find((g) => g.id === groupId)!
            .memberIds.map((pid) => {
              const p = person(pid);
              const v = net[pid] ?? 0;
              const settled = Math.abs(v) < 0.005;
              return (
                <li
                  key={pid}
                  className="flex items-center gap-3 rounded-3xl border border-border bg-surface p-3.5 shadow-sm"
                >
                  <Avatar person={p} size="md" />
                  <span className="flex-1 font-bold">
                    {pid === state.meId ? "You" : p.name}
                  </span>
                  <span
                    className={`font-black ${
                      settled
                        ? "text-muted"
                        : v > 0
                          ? "text-positive"
                          : "text-negative"
                    }`}
                  >
                    {settled
                      ? "settled"
                      : (v > 0 ? "+" : "-") + money(Math.abs(v))}
                  </span>
                </li>
              );
            })}
        </ul>
      </section>
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
