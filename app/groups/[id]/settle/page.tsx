"use client";

import { useParams, useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { groupNet, simplifyDebts } from "@/lib/balances";
import { money } from "@/lib/format";
import { Avatar } from "@/components/Avatar";
import { Button, ButtonLink } from "@/components/Button";
import { Loading, NotFound } from "@/components/Screen";

export default function SettlePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { state, person, addSettlement, hydrated } = useStore();

  const group = state.groups.find((g) => g.id === id);
  if (!hydrated) return <Loading />;
  if (!group) return <NotFound what="group" />;

  const expenses = state.expenses.filter((e) => e.groupId === id);
  const settlements = state.settlements.filter((s) => s.groupId === id);
  const net = groupNet(group, expenses, settlements);
  const transfers = simplifyDebts(net);

  const record = (from: string, to: string, amount: number) => {
    addSettlement({ groupId: id, from, to, amount });
  };

  return (
    <main className="flex flex-1 flex-col">
      <header className="safe-top flex items-center justify-between px-5 pt-4">
        <button
          onClick={() => router.back()}
          className="font-bold text-muted active:scale-95"
        >
          Back
        </button>
        <h1 className="font-extrabold">Settle up</h1>
        <div className="w-10" />
      </header>

      <div className="flex flex-col gap-5 px-5 pt-6">
        <div className="rounded-4xl bg-gradient-to-br from-primary to-primary-strong p-5 text-white shadow-[var(--shadow)]">
          <p className="text-sm font-semibold text-white/85">{group.emoji} {group.name}</p>
          <p className="mt-1 text-lg font-black">
            {transfers.length === 0
              ? "All settled up 🎉"
              : `${transfers.length} payment${transfers.length > 1 ? "s" : ""} to clear up`}
          </p>
        </div>

        {transfers.length === 0 ? (
          <div className="flex flex-col items-center gap-4 rounded-3xl border border-border bg-surface p-8 text-center">
            <p className="text-5xl">🥳</p>
            <p className="font-bold">Nobody owes anybody. Nice!</p>
            <ButtonLink href={`/groups/${id}`} variant="soft">
              Back to group
            </ButtonLink>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {transfers.map((t, i) => {
              const from = person(t.from);
              const to = person(t.to);
              return (
                <li
                  key={i}
                  className="flex flex-col gap-3 rounded-3xl border border-border bg-surface p-4 shadow-sm"
                >
                  <div className="flex items-center gap-3">
                    <Avatar person={from} size="md" />
                    <div className="flex flex-1 flex-col">
                      <span className="text-sm font-bold">
                        <b>{t.from === state.meId ? "You" : from.name}</b> pays{" "}
                        <b>{t.to === state.meId ? "you" : to.name}</b>
                      </span>
                      <span className="text-xs font-semibold text-muted">
                        settles {money(t.amount)}
                      </span>
                    </div>
                    <Avatar person={to} size="md" />
                  </div>
                  <Button
                    onClick={() => record(t.from, t.to, t.amount)}
                    variant="positive"
                    fullWidth
                  >
                    Mark {money(t.amount)} as paid
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
}
