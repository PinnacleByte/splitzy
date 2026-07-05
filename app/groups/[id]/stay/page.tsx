"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { computeNights, nightsBetween } from "@/lib/split";
import { money } from "@/lib/format";
import type { Group } from "@/lib/types";
import { Avatar } from "@/components/Avatar";
import { Button, ButtonLink } from "@/components/Button";
import { InviteButton } from "@/components/InviteButton";
import { DateField } from "@/components/inputs";
import { Loading, NotFound } from "@/components/Screen";

export default function StayPage() {
  const { id } = useParams<{ id: string }>();
  const { state, hydrated } = useStore();
  const group = state.groups.find((g) => g.id === id);
  if (!hydrated) return <Loading />;
  if (!group) return <NotFound what="group" />;
  if (!group.stay)
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
        <p className="text-5xl">🧾</p>
        <p className="font-bold">This group has no hotel stay</p>
        <ButtonLink href={`/groups/${group.id}`} variant="soft">
          Back to group
        </ButtonLink>
      </div>
    );
  return <StayEditor group={group} />;
}

function StayEditor({ group }: { group: Group }) {
  const router = useRouter();
  const { state, person, updateStay, setMemberStay, addMemberToGroup } = useStore();
  const stay = group.stay!;
  const [priceText, setPriceText] = useState(stay.price ? String(stay.price) : "");
  const [adding, setAdding] = useState(false);

  const totalNights = nightsBetween(stay.checkIn, stay.checkOut);
  const splits = computeNights(stay.price, stay.checkIn, stay.checkOut, stay.stays);
  const shareOf = (pid: string) => splits.find((s) => s.personId === pid)?.amount ?? 0;
  const stayFor = (pid: string) =>
    stay.stays.find((s) => s.personId === pid) ?? {
      personId: pid,
      from: stay.checkIn,
      to: stay.checkOut,
    };

  const available = state.people.filter((p) => !group.memberIds.includes(p.id));

  const commitPrice = (v: string) => {
    setPriceText(v);
    updateStay(group.id, { price: parseFloat(v) || 0 });
  };
  const addExisting = (pid: string) => {
    addMemberToGroup(group.id, pid, { from: stay.checkIn, to: stay.checkOut });
    setAdding(false);
  };

  return (
    <main className="flex flex-1 flex-col">
      <header className="safe-top flex items-center justify-between px-5 pt-4">
        <button onClick={() => router.push(`/groups/${group.id}`)} className="font-bold text-muted active:scale-95">
          Done
        </button>
        <h1 className="font-extrabold">Hotel stay</h1>
        <div className="w-12" />
      </header>

      <div className="flex flex-col gap-5 px-5 pt-5">
        {/* summary */}
        <section className="rounded-4xl bg-gradient-to-br from-primary to-primary-strong p-5 text-white shadow-[var(--shadow)]">
          <p className="text-sm font-semibold text-white/85">
            {group.emoji} {group.name}
          </p>
          <div className="mt-1 flex items-end justify-between">
            <p className="text-3xl font-black">{money(stay.price)}</p>
            <p className="text-sm font-bold text-white/85">
              {totalNights} nights · {money(totalNights ? stay.price / totalNights : 0)}/night
            </p>
          </div>
        </section>

        {/* price + dates */}
        <section className="flex flex-col gap-3 rounded-3xl border border-border bg-surface p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-muted">Total price</span>
            <div className="flex items-center gap-1 rounded-full bg-surface-2 px-3 py-1.5">
              <span className="text-sm font-black text-muted">$</span>
              <input
                inputMode="decimal"
                value={priceText}
                onChange={(e) => commitPrice(e.target.value.replace(/[^0-9.]/g, ""))}
                className="w-24 bg-transparent text-right text-sm font-black outline-none"
              />
            </div>
          </div>
          <div>
            <p className="mb-2 text-sm font-bold text-muted">Check-in → Check-out</p>
            <div className="flex items-center gap-2">
              <DateField
                value={stay.checkIn}
                max={stay.checkOut}
                onChange={(v) => updateStay(group.id, { checkIn: v })}
              />
              <span className="text-muted">→</span>
              <DateField
                value={stay.checkOut}
                min={stay.checkIn}
                onChange={(v) => updateStay(group.id, { checkOut: v })}
              />
            </div>
          </div>
          <div>
            <p className="mb-2 text-sm font-bold text-muted">Paid by</p>
            <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
              {group.memberIds.map((pid) => {
                const p = person(pid);
                const active = stay.paidBy === pid;
                return (
                  <button
                    key={pid}
                    onClick={() => updateStay(group.id, { paidBy: pid })}
                    className={`flex shrink-0 items-center gap-2 rounded-full py-1.5 pl-1.5 pr-4 font-bold transition-all ${
                      active ? "bg-primary text-white shadow-md shadow-primary/25" : "bg-surface-2"
                    }`}
                  >
                    <Avatar person={p} size="sm" />
                    <span className="text-sm">{pid === state.meId ? "You" : p.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* per-member nights */}
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between px-1">
            <h3 className="font-extrabold">Who stayed when</h3>
            <button
              onClick={() => setAdding((v) => !v)}
              className="rounded-full bg-primary-soft px-3 py-1.5 text-xs font-bold text-primary active:scale-95"
            >
              + Add member
            </button>
          </div>

          {adding && (
            <div className="flex flex-col gap-2 rounded-2xl border border-dashed border-primary/40 bg-primary-soft/40 p-3">
              {available.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {available.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => addExisting(p.id)}
                      className="flex items-center gap-2 rounded-full bg-surface py-1.5 pl-1.5 pr-4 text-sm font-bold shadow-sm active:scale-95"
                    >
                      <Avatar person={p} size="sm" />
                      {p.name}
                    </button>
                  ))}
                </div>
              )}
              <InviteButton groupId={group.id} label="Invite someone new to this trip" />
            </div>
          )}

          <ul className="flex flex-col gap-2">
            {group.memberIds.map((pid) => {
              const p = person(pid);
              const st = stayFor(pid);
              const n = nightsBetween(st.from, st.to);
              return (
                <li key={pid} className="rounded-2xl border border-border bg-surface p-3 shadow-sm">
                  <div className="flex items-center gap-3">
                    <Avatar person={p} size="sm" />
                    <span className="flex-1 font-bold">{pid === state.meId ? "You" : p.name}</span>
                    <span className="text-xs font-bold text-muted">{n}n</span>
                    <span className="font-black text-primary">{money(shareOf(pid))}</span>
                  </div>
                  <div className="mt-2 flex items-center gap-2 pl-11">
                    <DateField
                      value={st.from}
                      min={stay.checkIn}
                      max={stay.checkOut}
                      onChange={(v) => setMemberStay(group.id, pid, { from: v, to: st.to })}
                    />
                    <span className="text-muted">→</span>
                    <DateField
                      value={st.to}
                      min={st.from}
                      max={stay.checkOut}
                      onChange={(v) => setMemberStay(group.id, pid, { from: st.from, to: v })}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        <Button onClick={() => router.push(`/groups/${group.id}`)} size="lg" fullWidth className="mb-4 mt-1">
          Done
        </Button>
      </div>
    </main>
  );
}
