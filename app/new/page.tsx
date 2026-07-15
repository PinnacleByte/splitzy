"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { computeNights, nightsBetween } from "@/lib/split";
import { money } from "@/lib/format";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/Button";
import { AddFriendForm } from "@/components/AddFriendForm";
import { DateField, PriceInput } from "@/components/inputs";

const GROUP_EMOJIS = ["🏖️", "🏨", "🏠", "✈️", "🎉", "⛰️", "🏀", "🎓", "💼", "🚗", "🍻", "🎁"];

const iso = (d: Date) => d.toISOString().slice(0, 10);
const plusDays = (s: string, n: number) =>
  iso(new Date(Date.parse(`${s}T00:00:00Z`) + n * 86_400_000));
const TODAY = iso(new Date());

export default function NewGroupWizard() {
  const router = useRouter();
  const { state, person, addGroup } = useStore();

  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("🎉");
  const [selected, setSelected] = useState<string[]>([]);
  const [isStay, setIsStay] = useState<boolean | null>(null);
  const [checkIn, setCheckIn] = useState(TODAY);
  const [checkOut, setCheckOut] = useState(plusDays(TODAY, 7));
  const [price, setPrice] = useState("");
  const [paidBy, setPaidBy] = useState(state.meId);
  const [ranges, setRanges] = useState<Record<string, { from: string; to: string }>>({});

  const memberIds = useMemo(() => [state.meId, ...selected], [state.meId, selected]);
  const others = state.people.filter((p) => p.id !== state.meId);
  const priceNum = parseFloat(price) || 0;
  const maxStep = isStay ? 5 : 3;

  const rangeFor = (pid: string) => ranges[pid] ?? { from: checkIn, to: checkOut };
  const stays = memberIds.map((pid) => ({ personId: pid, ...rangeFor(pid) }));
  const preview = useMemo(
    () => computeNights(priceNum, checkIn, checkOut, stays),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [priceNum, checkIn, checkOut, JSON.stringify(stays)],
  );
  const shareOf = (pid: string) =>
    preview.find((s) => s.personId === pid)?.amount ?? 0;

  const toggle = (pid: string) =>
    setSelected((prev) =>
      prev.includes(pid) ? prev.filter((x) => x !== pid) : [...prev, pid],
    );

  const stepValid =
    step === 1
      ? name.trim().length > 0
      : step === 3
        ? isStay !== null
        : step === 4
          ? priceNum > 0 && nightsBetween(checkIn, checkOut) > 0
          : true;

  const create = () => {
    const stay = isStay
      ? {
          checkIn,
          checkOut,
          price: priceNum,
          paidBy,
          stays: memberIds.map((pid) => ({ personId: pid, ...rangeFor(pid) })),
        }
      : undefined;
    const g = addGroup({ name: name.trim(), emoji, memberIds: selected, stay });
    router.push(`/groups/${g.id}`);
  };

  const next = () => {
    if (!stepValid) return;
    if (step >= maxStep) create();
    else setStep(step + 1);
  };
  const back = () => (step > 1 ? setStep(step - 1) : router.back());

  const STEP_TITLES = ["Name your group", "Add people", "Trip type", "Booking details", "Who stayed when"];

  return (
    <main className="flex flex-1 flex-col">
      <header className="safe-top flex items-center justify-between px-5 pt-4">
        <button onClick={back} className="font-bold text-muted active:scale-95">
          {step === 1 ? "Cancel" : "Back"}
        </button>
        <h1 className="font-extrabold">{STEP_TITLES[step - 1]}</h1>
        <span className="w-14 text-right text-sm font-bold text-muted">
          {step}/{maxStep}
        </span>
      </header>

      {/* progress bar */}
      <div className="mx-5 mt-3 h-1.5 overflow-hidden rounded-full bg-surface-2">
        <div
          className="h-full rounded-full bg-gradient-to-r from-primary to-primary-strong transition-all"
          style={{ width: `${(step / maxStep) * 100}%` }}
        />
      </div>

      <div className="flex flex-1 flex-col gap-6 px-5 pt-6">
        {/* STEP 1 — name + emoji */}
        {step === 1 && (
          <div className="flex flex-col items-center gap-4">
            <div className="grid h-24 w-24 place-items-center rounded-4xl bg-surface text-5xl shadow-[var(--shadow)]">
              {emoji}
            </div>
            <input
              autoFocus
              placeholder="Group name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && next()}
              className="w-full rounded-3xl border border-border bg-surface px-5 py-4 text-center text-lg font-extrabold outline-none placeholder:font-bold placeholder:text-muted focus:border-primary"
            />
            <div className="no-scrollbar flex gap-2 self-stretch overflow-x-auto pb-1">
              {GROUP_EMOJIS.map((em) => (
                <button
                  key={em}
                  onClick={() => setEmoji(em)}
                  className={`grid h-11 w-11 shrink-0 place-items-center rounded-full text-xl transition-all ${
                    emoji === em ? "bg-primary-soft ring-2 ring-primary" : "bg-surface-2"
                  }`}
                >
                  {em}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* STEP 2 — members */}
        {step === 2 && (
          <section className="flex flex-col gap-2">
            <p className="px-1 text-sm font-bold text-muted">
              You can always add more people later.
            </p>
            <div className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-3">
              <Avatar person={person(state.meId)} size="sm" />
              <span className="flex-1 font-bold">You</span>
              <span className="text-xs font-bold text-muted">owner</span>
            </div>
            {others.map((p) => {
              const checked = selected.includes(p.id);
              return (
                <button
                  key={p.id}
                  onClick={() => toggle(p.id)}
                  className={`flex w-full items-center gap-3 rounded-2xl border p-3 transition-all ${
                    checked ? "border-primary/30 bg-surface" : "border-border bg-surface/50 opacity-60"
                  }`}
                >
                  <Avatar person={p} size="sm" />
                  <span className="flex-1 text-left font-bold">{p.name}</span>
                  <Check checked={checked} />
                </button>
              );
            })}
            <div className="mt-1 rounded-2xl border border-dashed border-border bg-surface/50 p-2">
              <AddFriendForm label="Add someone new" />
              <p className="mt-2 px-1 text-xs font-semibold text-muted">
                They&apos;ll join your friends list right away — add them to this group
                afterward.
              </p>
            </div>
          </section>
        )}

        {/* STEP 3 — trip type */}
        {step === 3 && (
          <section className="flex flex-col gap-3">
            <p className="px-1 text-sm font-bold text-muted">
              Is this group sharing a hotel / accommodation?
            </p>
            <TypeCard
              active={isStay === true}
              onClick={() => setIsStay(true)}
              emoji="🏨"
              title="Staying together"
              desc="Split a hotel booking by how many nights each person stays."
            />
            <TypeCard
              active={isStay === false}
              onClick={() => setIsStay(false)}
              emoji="🧾"
              title="Just shared expenses"
              desc="Regular group — add expenses and split them as you go."
            />
          </section>
        )}

        {/* STEP 4 — booking details */}
        {step === 4 && (
          <section className="flex flex-col gap-5">
            <div className="flex flex-col items-center gap-1 py-1">
              <span className="text-xs font-bold text-muted">Total booking price</span>
              <PriceInput value={price} onChange={setPrice} autoFocus />
            </div>
            <div className="rounded-2xl border border-border bg-surface p-3">
              <p className="mb-2 text-sm font-bold text-muted">Check-in → Check-out</p>
              <div className="flex items-center gap-2">
                <DateField value={checkIn} onChange={setCheckIn} />
                <span className="text-muted">→</span>
                <DateField value={checkOut} onChange={setCheckOut} min={checkIn} />
              </div>
              <p className="mt-2 text-xs font-bold text-primary">
                {nightsBetween(checkIn, checkOut)} nights ·{" "}
                {money(nightsBetween(checkIn, checkOut) ? priceNum / nightsBetween(checkIn, checkOut) : 0)} / night
              </p>
            </div>
            <div>
              <p className="mb-2 px-1 text-sm font-bold text-muted">Who paid the hotel?</p>
              <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
                {memberIds.map((pid) => {
                  const p = person(pid);
                  const active = paidBy === pid;
                  return (
                    <button
                      key={pid}
                      onClick={() => setPaidBy(pid)}
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
        )}

        {/* STEP 5 — per-member nights */}
        {step === 5 && (
          <section className="flex flex-col gap-3">
            <p className="px-1 text-sm font-bold text-muted">
              Set each person&apos;s nights. The cost splits per night by who&apos;s there.
            </p>
            <ul className="flex flex-col gap-2">
              {memberIds.map((pid) => {
                const p = person(pid);
                const r = rangeFor(pid);
                return (
                  <li key={pid} className="rounded-2xl border border-border bg-surface p-3 shadow-sm">
                    <div className="flex items-center gap-3">
                      <Avatar person={p} size="sm" />
                      <span className="flex-1 font-bold">{pid === state.meId ? "You" : p.name}</span>
                      <span className="text-xs font-bold text-muted">{nightsBetween(r.from, r.to)}n</span>
                      <span className="font-black text-primary">{money(shareOf(pid))}</span>
                    </div>
                    <div className="mt-2 flex items-center gap-2 pl-11">
                      <DateField
                        value={r.from}
                        min={checkIn}
                        max={checkOut}
                        onChange={(v) => setRanges((prev) => ({ ...prev, [pid]: { ...rangeFor(pid), from: v } }))}
                      />
                      <span className="text-muted">→</span>
                      <DateField
                        value={r.to}
                        min={r.from}
                        max={checkOut}
                        onChange={(v) => setRanges((prev) => ({ ...prev, [pid]: { ...rangeFor(pid), to: v } }))}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <div className="mt-auto pb-4">
          <Button onClick={next} disabled={!stepValid} size="lg" fullWidth>
            {step >= maxStep ? "Create group" : "Continue"}
          </Button>
        </div>
      </div>
    </main>
  );
}

function TypeCard({
  active,
  onClick,
  emoji,
  title,
  desc,
}: {
  active: boolean;
  onClick: () => void;
  emoji: string;
  title: string;
  desc: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-4 rounded-3xl border p-4 text-left transition-all ${
        active ? "border-primary bg-primary-soft" : "border-border bg-surface"
      }`}
    >
      <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-surface-2 text-2xl">
        {emoji}
      </span>
      <div className="flex-1">
        <p className="font-extrabold">{title}</p>
        <p className="text-xs font-semibold text-muted">{desc}</p>
      </div>
      <span
        className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 ${
          active ? "border-primary bg-primary text-white" : "border-border"
        }`}
      >
        {active && <Dot />}
      </span>
    </button>
  );
}

function Check({ checked }: { checked: boolean }) {
  return (
    <span
      className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 transition-colors ${
        checked ? "border-primary bg-primary text-white" : "border-border"
      }`}
    >
      {checked && (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 6L9 17l-5-5" />
        </svg>
      )}
    </span>
  );
}
function Dot() {
  return <span className="h-2 w-2 rounded-full bg-white" />;
}
