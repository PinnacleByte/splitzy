"use client";

import Link from "next/link";
import { useStore } from "@/lib/store";
import { friendNet, overallNet } from "@/lib/balances";
import { money } from "@/lib/format";
import { getCategoryMeta } from "@/lib/categories";

export default function InsightsPage() {
  const { state } = useStore();
  const me = state.meId;

  const net = overallNet(state);
  const owed = state.people
    .filter((p) => p.id !== me)
    .reduce((s, p) => { const n = friendNet(state, me, p.id); return s + (n > 0 ? n : 0); }, 0);
  const owe = state.people
    .filter((p) => p.id !== me)
    .reduce((s, p) => { const n = friendNet(state, me, p.id); return s + (n < 0 ? -n : 0); }, 0);

  const youPaid =
    state.expenses.filter((e) => e.paidBy === me).reduce((s, e) => s + e.amount, 0) +
    state.groups.filter((g) => g.stay?.paidBy === me).reduce((s, g) => s + (g.stay?.price ?? 0), 0);

  // spending by group (total volume)
  const byGroup = state.groups
    .map((g) => ({
      label: g.name,
      emoji: g.emoji,
      total:
        state.expenses.filter((e) => e.groupId === g.id).reduce((s, e) => s + e.amount, 0) +
        (g.stay?.price ?? 0),
    }))
    .filter((x) => x.total > 0)
    .sort((a, b) => b.total - a.total);

  // spending by category
  const catMap = new Map<string, { label: string; emoji: string; total: number }>();
  const bump = (key: string, label: string, emoji: string, amt: number) => {
    const cur = catMap.get(key) ?? { label, emoji, total: 0 };
    cur.total += amt;
    catMap.set(key, cur);
  };
  for (const e of state.expenses) {
    const c = e.category ? getCategoryMeta(e.category) : undefined;
    const label = c?.label ?? (e.category === "advanced" ? "Custom" : "Other");
    const emoji = c?.emoji ?? "🧾";
    bump(e.category ?? "other", label, emoji, e.amount);
  }
  for (const g of state.groups) if (g.stay) bump("hotel", "Hotel stays", "🏨", g.stay.price);
  const byCategory = [...catMap.values()].filter((x) => x.total > 0).sort((a, b) => b.total - a.total);

  const totalVolume = byGroup.reduce((s, x) => s + x.total, 0);

  return (
    <main className="safe-top flex flex-1 flex-col gap-5 px-5 pt-4">
      <h1 className="text-2xl font-black">Insights</h1>

      {/* hero */}
      <section className="rounded-4xl bg-gradient-to-br from-primary to-primary-strong p-6 text-white shadow-[var(--shadow)]">
        <p className="text-sm font-semibold text-white/80">
          {net >= 0 ? "Overall, you are owed" : "Overall, you owe"}
        </p>
        <p className="mt-1 text-4xl font-black tracking-tight">{money(Math.abs(net))}</p>
        <div className="mt-4 flex gap-2">
          <Pill label="Owed to you" value={money(owed)} />
          <Pill label="You owe" value={money(owe)} />
        </div>
      </section>

      {/* stat tiles */}
      <section className="grid grid-cols-3 gap-3">
        <Stat label="You paid" value={money(youPaid)} />
        <Stat label="Volume" value={money(totalVolume)} />
        <Stat label="Expenses" value={String(state.expenses.length)} />
      </section>

      <BarList title="Spending by group" items={byGroup} />
      <BarList title="Spending by category" items={byCategory} />

      <Link
        href="/activity"
        className="mb-2 rounded-3xl border border-border bg-surface p-4 text-center text-sm font-bold text-primary shadow-sm active:scale-[0.99]"
      >
        View all activity →
      </Link>
    </main>
  );
}

function Pill({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex-1 rounded-2xl bg-white/15 px-3 py-2 backdrop-blur">
      <p className="text-[11px] font-bold text-white/75">{label}</p>
      <p className="text-base font-black">{value}</p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-3 text-center shadow-sm">
      <p className="truncate text-lg font-black">{value}</p>
      <p className="text-[11px] font-bold text-muted">{label}</p>
    </div>
  );
}

function BarList({
  title,
  items,
}: {
  title: string;
  items: { label: string; emoji: string; total: number }[];
}) {
  if (items.length === 0) return null;
  const max = Math.max(...items.map((x) => x.total));
  return (
    <section className="flex flex-col gap-3 rounded-3xl border border-border bg-surface p-4 shadow-sm">
      <h2 className="text-sm font-extrabold">{title}</h2>
      <ul className="flex flex-col gap-3">
        {items.map((x) => (
          <li key={x.label} className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-sm">
              <span className="font-bold">
                {x.emoji} {x.label}
              </span>
              <span className="font-black tabular-nums">{money(x.total)}</span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full rounded-full bg-gradient-to-r from-primary to-primary-strong"
                style={{ width: `${Math.max(6, (x.total / max) * 100)}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
