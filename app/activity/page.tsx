"use client";

import Link from "next/link";
import { useStore } from "@/lib/store";
import { money, relativeTime } from "@/lib/format";
import { Avatar } from "@/components/Avatar";

type Item =
  | { kind: "expense"; ts: number; groupId: string; emoji: string; title: string; sub: string; amount: number }
  | { kind: "settle"; id: string; ts: number; groupId: string; from: string; to: string; amount: number }
  | { kind: "stay"; ts: number; groupId: string; sub: string; amount: number };

export default function ActivityPage() {
  const { state, person, deleteSettlement } = useStore();
  const groupName = (id: string) =>
    state.groups.find((g) => g.id === id)?.name ?? "";

  const items: Item[] = [
    ...state.expenses.map((e) => ({
      kind: "expense" as const,
      ts: e.createdAt,
      groupId: e.groupId,
      emoji: e.emoji,
      title: e.description,
      sub: `${e.paidBy === state.meId ? "You" : person(e.paidBy).name} paid · ${groupName(e.groupId)}`,
      amount: e.amount,
    })),
    ...state.settlements.map((s) => ({
      kind: "settle" as const,
      id: s.id,
      ts: s.createdAt,
      groupId: s.groupId,
      from: s.from,
      to: s.to,
      amount: s.amount,
    })),
    ...state.groups
      .filter((g) => g.stay)
      .map((g) => ({
        kind: "stay" as const,
        ts: g.createdAt,
        groupId: g.id,
        sub: `${g.stay!.paidBy === state.meId ? "You" : person(g.stay!.paidBy).name} paid · ${g.name}`,
        amount: g.stay!.price,
      })),
  ].sort((a, b) => b.ts - a.ts);

  return (
    <main className="safe-top flex flex-1 flex-col gap-5 px-5 pt-4">
      <h1 className="text-2xl font-black">Activity</h1>

      {items.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-border bg-surface/60 p-8 text-center">
          <p className="text-4xl">🌱</p>
          <p className="mt-2 font-bold">Nothing here yet</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((it, i) => (
            <li
              key={i}
              className="group flex items-center gap-1 rounded-3xl border border-border bg-surface p-4 shadow-sm transition-transform hover:-translate-y-0.5"
            >
              <Link href={`/groups/${it.groupId}`} className="flex min-w-0 flex-1 items-center gap-3">
                {it.kind === "expense" && (
                  <>
                    <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-surface-2 text-xl">
                      {it.emoji}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-bold">{it.title}</p>
                      <p className="truncate text-xs font-semibold text-muted">
                        {it.sub} · {relativeTime(it.ts)}
                      </p>
                    </div>
                    <span className="font-black">{money(it.amount)}</span>
                  </>
                )}
                {it.kind === "settle" && (
                  <>
                    <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-positive-soft text-xl">
                      🤝
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-bold">
                        {it.from === state.meId ? "You" : person(it.from).name}{" "}
                        paid{" "}
                        {it.to === state.meId ? "you" : person(it.to).name}
                      </p>
                      <p className="truncate text-xs font-semibold text-muted">
                        Settlement · {groupName(it.groupId)} ·{" "}
                        {relativeTime(it.ts)}
                      </p>
                    </div>
                    <span className="font-black text-positive">
                      {money(it.amount)}
                    </span>
                  </>
                )}
                {it.kind === "stay" && (
                  <>
                    <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-surface-2 text-xl">
                      🏨
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-bold">Hotel stay</p>
                      <p className="truncate text-xs font-semibold text-muted">
                        {it.sub} · {relativeTime(it.ts)}
                      </p>
                    </div>
                    <span className="font-black">{money(it.amount)}</span>
                  </>
                )}
              </Link>
              {it.kind === "settle" && (
                <button
                  onClick={() => {
                    if (confirm(`Undo this payment of ${money(it.amount)}?`)) deleteSettlement(it.id);
                  }}
                  aria-label="Undo settlement"
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted opacity-0 transition-opacity hover:bg-negative-soft hover:text-negative group-hover:opacity-100"
                >
                  <TrashIcon />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

function TrashIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    </svg>
  );
}
