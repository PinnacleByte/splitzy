"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { groupNet, simplifyDebts, householdNet, resolveUnitTransfer } from "@/lib/balances";
import { money } from "@/lib/format";
import type { Household, Person } from "@/lib/types";
import { Avatar } from "@/components/Avatar";
import { Button, ButtonLink } from "@/components/Button";
import { Loading, NotFound } from "@/components/Screen";

export default function SettlePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { state, person, addSettlement, hydrated } = useStore();

  const group = state.groups.find((g) => g.id === id);
  const [byHousehold, setByHousehold] = useState(true);
  if (!hydrated) return <Loading />;
  if (!group) return <NotFound what="group" />;

  const households = group.households ?? [];
  const hasHouseholds = households.length > 0;
  const grouped = hasHouseholds && byHousehold;

  const expenses = state.expenses.filter((e) => e.groupId === id);
  const settlements = state.settlements.filter((s) => s.groupId === id);
  const net = groupNet(group, expenses, settlements);
  const netView = grouped ? householdNet(net, households) : net;
  const transfers = simplifyDebts(netView);

  const hById = (uid: string) => households.find((h) => h.id === uid);
  const unitName = (uid: string) => hById(uid)?.name || (uid === state.meId ? "You" : person(uid).name);

  const record = (fromUnit: string, toUnit: string, amount: number) => {
    // household transfers are recorded as a concrete person→person settlement
    const { from, to } = grouped
      ? resolveUnitTransfer(fromUnit, toUnit, net, households)
      : { from: fromUnit, to: toUnit };
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
            {transfers.map((t, i) => (
              <li
                key={i}
                className="flex flex-col gap-3 rounded-3xl border border-border bg-surface p-4 shadow-sm"
              >
                <div className="flex items-center gap-3">
                  <UnitFace id={t.from} households={households} person={person} />
                  <div className="flex flex-1 flex-col">
                    <span className="text-sm font-bold">
                      <b>{unitName(t.from)}</b> pays <b>{unitName(t.to)}</b>
                    </span>
                    <span className="text-xs font-semibold text-muted">
                      settles {money(t.amount)}
                    </span>
                  </div>
                  <UnitFace id={t.to} households={households} person={person} />
                </div>
                <Button
                  onClick={() => record(t.from, t.to, t.amount)}
                  variant="positive"
                  fullWidth
                >
                  Mark {money(t.amount)} as paid
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}

/** Avatar for a settle "unit": household emoji tile, or a person's avatar. */
function UnitFace({
  id,
  households,
  person,
}: {
  id: string;
  households: Household[];
  person: (id: string) => Person;
}) {
  const h = households.find((x) => x.id === id);
  if (h)
    return (
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-surface-2 text-xl">
        {h.emoji}
      </span>
    );
  return <Avatar person={person(id)} size="md" />;
}
