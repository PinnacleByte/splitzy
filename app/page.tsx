"use client";

import Link from "next/link";
import { useStore } from "@/lib/store";
import { groupNet, overallNet } from "@/lib/balances";
import { money } from "@/lib/format";
import { Avatar, AvatarStack } from "@/components/Avatar";
import { ButtonLink } from "@/components/Button";
import { ThemeToggle } from "@/components/ThemeToggle";

export default function HomePage() {
  const { state, me, person } = useStore();
  const net = overallNet(state);
  const positive = net >= 0;

  return (
    <main className="safe-top flex flex-1 flex-col gap-6 px-5 pt-4">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Avatar person={me} size="md" />
          <div>
            <p className="text-xs font-semibold text-muted">Welcome back</p>
            <h1 className="text-lg font-extrabold leading-tight">{me.name} 👋</h1>
          </div>
        </div>
        <ThemeToggle />
      </header>

      {/* Overall balance hero */}
      <section className="animate-pop rounded-4xl bg-gradient-to-br from-primary to-primary-strong p-6 text-white shadow-[var(--shadow)]">
        <p className="text-sm font-semibold text-white/80">
          {net === 0
            ? "You're all settled up 🎉"
            : positive
              ? "Overall, you are owed"
              : "Overall, you owe"}
        </p>
        <p className="mt-1 text-4xl font-black tracking-tight">{money(net)}</p>
        <div className="mt-5 flex gap-3">
          <ButtonLink
            href="/new"
            variant="ghost"
            className="!bg-white/15 !text-white backdrop-blur hover:!bg-white/25"
          >
            <PlusIcon /> New group
          </ButtonLink>
        </div>
      </section>

      {/* Groups */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-base font-extrabold">Your groups</h2>
          <span className="rounded-full bg-surface px-3 py-1 text-xs font-bold text-muted">
            {state.groups.length}
          </span>
        </div>

        {state.groups.length === 0 && <EmptyGroups />}

        <ul className="flex flex-col gap-3">
          {state.groups.map((g) => {
            const exp = state.expenses.filter((e) => e.groupId === g.id);
            const set = state.settlements.filter((s) => s.groupId === g.id);
            const bal = groupNet(g, exp, set)[state.meId] ?? 0;
            const members = g.memberIds.map(person);
            return (
              <li key={g.id}>
                <Link
                  href={`/groups/${g.id}`}
                  className="group flex items-center gap-4 rounded-3xl border border-border bg-surface p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
                >
                  <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-surface-2 text-2xl">
                    {g.emoji}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-extrabold">{g.name}</p>
                    <div className="mt-1.5">
                      <AvatarStack people={members} />
                    </div>
                  </div>
                  <div className="text-right">
                    <BalanceTag value={bal} />
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>
    </main>
  );
}

function BalanceTag({ value }: { value: number }) {
  if (Math.abs(value) < 0.005)
    return <span className="text-xs font-bold text-muted">settled</span>;
  const owed = value > 0;
  return (
    <div className="flex flex-col items-end">
      <span
        className={`text-[11px] font-bold ${owed ? "text-positive" : "text-negative"}`}
      >
        {owed ? "you're owed" : "you owe"}
      </span>
      <span
        className={`text-base font-black ${owed ? "text-positive" : "text-negative"}`}
      >
        {money(Math.abs(value))}
      </span>
    </div>
  );
}

function EmptyGroups() {
  return (
    <div className="rounded-3xl border border-dashed border-border bg-surface/60 p-8 text-center">
      <p className="text-4xl">🫙</p>
      <p className="mt-2 font-bold">No groups yet</p>
      <p className="mt-1 text-sm text-muted">
        Create a group to start splitting bills.
      </p>
    </div>
  );
}

function PlusIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
