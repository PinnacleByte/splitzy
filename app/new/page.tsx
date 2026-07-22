"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { createPlaceholderPerson } from "@/lib/accountActions";
import { computeNights, nightsBetween } from "@/lib/split";
import { money } from "@/lib/format";
import type { Person } from "@/lib/types";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/Button";
import { AddFriendForm } from "@/components/AddFriendForm";
import { DateField, PriceInput } from "@/components/inputs";

const GROUP_EMOJIS = ["🏖️", "🏨", "🏠", "✈️", "🎉", "⛰️", "🏀", "🎓", "💼", "🚗", "🍻", "🎁"];
const FAMILY_EMOJIS = ["💑", "👪", "🧑‍🤝‍🧑", "👨‍👩‍👧", "👩‍👧", "🏠", "❤️", "🐣"];

const iso = (d: Date) => d.toISOString().slice(0, 10);
const plusDays = (s: string, n: number) =>
  iso(new Date(Date.parse(`${s}T00:00:00Z`) + n * 86_400_000));
const TODAY = iso(new Date());

/** a family being drafted in the wizard — persisted (via addGroup's
 *  households param) only when the whole group is created */
type FamilyDraft = {
  key: string;
  name: string;
  emoji: string;
  /** a real account — either an existing connection or a freshly added one */
  leadId: string | null;
  /** headcount-only members with no login; `id` is null until the family
   *  step is confirmed, at which point any not yet backed by a real
   *  (reused) placeholder get created */
  placeholders: { key: string; name: string; id: string | null }[];
};

const newFamily = (index: number): FamilyDraft => ({
  key: crypto.randomUUID(),
  name: `Family ${index + 1}`,
  emoji: FAMILY_EMOJIS[index % FAMILY_EMOJIS.length],
  leadId: null,
  placeholders: [],
});

export default function NewGroupWizard() {
  const router = useRouter();
  const { state, person, addGroup } = useStore();

  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("🎉");
  const [composition, setComposition] = useState<"singles" | "family" | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [families, setFamilies] = useState<FamilyDraft[]>([newFamily(0)]);
  const [finalizing, setFinalizing] = useState(false);
  const [finalizeError, setFinalizeError] = useState<string | null>(null);
  const [isStay, setIsStay] = useState<boolean | null>(null);
  const [checkIn, setCheckIn] = useState(TODAY);
  const [checkOut, setCheckOut] = useState(plusDays(TODAY, 7));
  const [price, setPrice] = useState("");
  const [paidBy, setPaidBy] = useState(state.meId);
  const [ranges, setRanges] = useState<Record<string, { from: string; to: string }>>({});

  const isFamily = composition === "family";
  const familyMemberIds = useMemo(
    () => [
      ...families.map((f) => f.leadId).filter((x): x is string => !!x),
      ...families.flatMap((f) => f.placeholders.map((p) => p.id).filter((x): x is string => !!x)),
    ],
    [families],
  );
  const memberIds = useMemo(
    () => [state.meId, ...(isFamily ? familyMemberIds : selected)],
    [state.meId, isFamily, familyMemberIds, selected],
  );
  const others = state.people.filter((p) => p.id !== state.meId);
  const availableLeads = others.filter((p) => !p.isPlaceholder);
  const availablePlaceholders = others.filter((p) => p.isPlaceholder);
  const priceNum = parseFloat(price) || 0;
  const maxStep = isStay ? 6 : 4;

  const rangeFor = (pid: string) => ranges[pid] ?? { from: checkIn, to: checkOut };
  const stays = memberIds.map((pid) => ({ personId: pid, ...rangeFor(pid) }));
  const staysKey = JSON.stringify(stays);
  const preview = useMemo(
    () => computeNights(priceNum, checkIn, checkOut, stays),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- staysKey stands in for stays' content
    [priceNum, checkIn, checkOut, staysKey],
  );
  const shareOf = (pid: string) =>
    preview.find((s) => s.personId === pid)?.amount ?? 0;

  const toggle = (pid: string) =>
    setSelected((prev) =>
      prev.includes(pid) ? prev.filter((x) => x !== pid) : [...prev, pid],
    );

  const familiesValid = families.length > 0 && families.every((f) => f.name.trim() && f.leadId);

  const stepValid =
    step === 1
      ? name.trim().length > 0
      : step === 2
        ? composition !== null
        : step === 3
          ? isFamily
            ? familiesValid
            : true
          : step === 4
            ? isStay !== null
            : step === 5
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
    const households = isFamily
      ? families.map((f) => ({
          name: f.name.trim(),
          emoji: f.emoji,
          memberIds: [
            f.leadId!,
            ...f.placeholders.map((p) => p.id).filter((x): x is string => !!x),
          ],
        }))
      : undefined;
    const g = addGroup({
      name: name.trim(),
      emoji,
      memberIds: isFamily ? familyMemberIds : selected,
      stay,
      households,
    });
    router.push(`/groups/${g.id}`);
  };

  /** the family step names any brand-new headcount members but doesn't create
   *  them until you confirm — so cancelling the wizard doesn't leave orphaned
   *  placeholder profiles behind. This creates any that don't already have a
   *  real id (a reused, previously-created family member already does). */
  const finalizeFamilies = async () => {
    setFinalizing(true);
    setFinalizeError(null);
    try {
      const resolved = await Promise.all(
        families.map(async (f) => ({
          ...f,
          placeholders: await Promise.all(
            f.placeholders.map(async (p) => {
              if (p.id) return p;
              const { id, error } = await createPlaceholderPerson({ name: p.name });
              if (error || !id) throw new Error(error ?? "Something went wrong.");
              return { ...p, id };
            }),
          ),
        })),
      );
      setFamilies(resolved);
      setStep(step + 1);
    } catch (err) {
      setFinalizeError(err instanceof Error ? err.message : "Couldn't add a family member.");
    } finally {
      setFinalizing(false);
    }
  };

  const next = () => {
    if (!stepValid || finalizing) return;
    if (isFamily && step === 3) {
      finalizeFamilies();
      return;
    }
    if (step >= maxStep) create();
    else setStep(step + 1);
  };
  const back = () => (step > 1 ? setStep(step - 1) : router.back());

  const STEP_TITLES = [
    "Name your group",
    "Trip style",
    isFamily ? "Build your families" : "Add people",
    "Trip type",
    "Booking details",
    "Who stayed when",
  ];

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
          className="h-full rounded-full bg-linear-to-r from-primary to-primary-strong transition-all"
          style={{ width: `${(step / maxStep) * 100}%` }}
        />
      </div>

      <div className="flex flex-1 flex-col gap-6 px-5 pt-6">
        {/* STEP 1 — name + emoji */}
        {step === 1 && (
          <div className="flex flex-col items-center gap-4">
            <div className="grid h-24 w-24 place-items-center rounded-4xl bg-surface text-5xl shadow-(--shadow)">
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

        {/* STEP 2 — singles or family trip */}
        {step === 2 && (
          <section className="flex flex-col gap-3">
            <p className="px-1 text-sm font-bold text-muted">
              Is this a group of individuals, or a few families/couples traveling together?
            </p>
            <TypeCard
              active={composition === "singles"}
              onClick={() => setComposition("singles")}
              emoji="🧑‍🤝‍🧑"
              title="Singles trip"
              desc="Pick people one at a time, same as any group."
            />
            <TypeCard
              active={composition === "family"}
              onClick={() => setComposition("family")}
              emoji="👪"
              title="Family trip"
              desc="Group people into families — each with one lead account and any number of members who don't need their own login."
            />
          </section>
        )}

        {/* STEP 3a — members (singles) */}
        {step === 3 && !isFamily && (
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

        {/* STEP 3b — build your families */}
        {step === 3 && isFamily && (
          <section className="flex flex-col gap-4">
            {families.map((f) => (
              <FamilyCard
                key={f.key}
                family={f}
                meId={state.meId}
                person={person}
                availableLeads={availableLeads}
                availablePlaceholders={availablePlaceholders}
                usedLeadIds={new Set(families.filter((x) => x.key !== f.key).map((x) => x.leadId))}
                usedPlaceholderIds={
                  new Set(
                    families
                      .filter((x) => x.key !== f.key)
                      .flatMap((x) => x.placeholders.map((p) => p.id)),
                  )
                }
                onChange={(patch) =>
                  setFamilies((prev) => prev.map((x) => (x.key === f.key ? { ...x, ...patch } : x)))
                }
                onRemove={
                  families.length > 1
                    ? () => setFamilies((prev) => prev.filter((x) => x.key !== f.key))
                    : undefined
                }
              />
            ))}
            <button
              onClick={() => setFamilies((prev) => [...prev, newFamily(prev.length)])}
              className="rounded-2xl border border-dashed border-border bg-surface/50 py-3 text-sm font-bold text-primary active:scale-[0.99]"
            >
              ＋ Add another family
            </button>
            {finalizeError && <p className="px-1 text-xs font-bold text-negative">{finalizeError}</p>}
          </section>
        )}

        {/* STEP 4 — trip type */}
        {step === 4 && (
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

        {/* STEP 5 — booking details */}
        {step === 5 && (
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

        {/* STEP 6 — per-member nights */}
        {step === 6 && (
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
          <Button onClick={next} disabled={!stepValid || finalizing} size="lg" fullWidth>
            {finalizing ? "Setting up families…" : step >= maxStep ? "Create group" : "Continue"}
          </Button>
        </div>
      </div>
    </main>
  );
}

function FamilyCard({
  family,
  meId,
  person,
  availableLeads,
  availablePlaceholders,
  usedLeadIds,
  usedPlaceholderIds,
  onChange,
  onRemove,
}: {
  family: FamilyDraft;
  meId: string;
  person: (id: string) => Person;
  availableLeads: Person[];
  availablePlaceholders: Person[];
  usedLeadIds: Set<string | null>;
  usedPlaceholderIds: Set<string | null>;
  onChange: (patch: Partial<FamilyDraft>) => void;
  onRemove?: () => void;
}) {
  const [newMemberName, setNewMemberName] = useState("");

  const mePerson = person(meId);
  const meAlreadyLeadElsewhere = usedLeadIds.has(meId) && family.leadId !== meId;
  const leadCandidates: Person[] = [
    ...(meAlreadyLeadElsewhere ? [] : [mePerson]),
    ...availableLeads.filter((p) => family.leadId === p.id || !usedLeadIds.has(p.id)),
  ];
  const placeholderCandidates = availablePlaceholders.filter(
    (p) => !usedPlaceholderIds.has(p.id) && !family.placeholders.some((fp) => fp.id === p.id),
  );

  const addPlaceholderName = () => {
    const trimmed = newMemberName.trim();
    if (!trimmed) return;
    onChange({
      placeholders: [...family.placeholders, { key: crypto.randomUUID(), name: trimmed, id: null }],
    });
    setNewMemberName("");
  };
  const removePlaceholder = (key: string) =>
    onChange({ placeholders: family.placeholders.filter((p) => p.key !== key) });
  const addExistingPlaceholder = (p: Person) =>
    onChange({
      placeholders: [...family.placeholders, { key: crypto.randomUUID(), name: p.name, id: p.id }],
    });

  return (
    <div className="flex flex-col gap-3 rounded-3xl border border-border bg-surface p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-surface-2 text-lg">
          {family.emoji}
        </span>
        <input
          value={family.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="Family name"
          className="min-w-0 flex-1 rounded-full bg-surface-2 px-4 py-2 text-sm font-extrabold outline-none placeholder:font-semibold placeholder:text-muted"
        />
        {onRemove && (
          <button
            onClick={onRemove}
            aria-label="Remove family"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted hover:bg-negative-soft hover:text-negative"
          >
            <TrashIcon />
          </button>
        )}
      </div>

      <div className="no-scrollbar flex gap-1.5 overflow-x-auto pb-1">
        {FAMILY_EMOJIS.map((em) => (
          <button
            key={em}
            onClick={() => onChange({ emoji: em })}
            className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-base transition-all ${
              family.emoji === em ? "bg-primary-soft ring-2 ring-primary" : "bg-surface-2"
            }`}
          >
            {em}
          </button>
        ))}
      </div>

      <div>
        <p className="mb-1.5 px-1 text-xs font-bold text-muted">Lead — has the account</p>
        {leadCandidates.length === 0 ? (
          <p className="px-1 text-xs font-semibold text-muted">
            Add a friend from the Friends tab first to use them as a lead.
          </p>
        ) : (
          <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
            {leadCandidates.map((p) => {
              const active = family.leadId === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => onChange({ leadId: p.id })}
                  className={`flex shrink-0 items-center gap-2 rounded-full py-1.5 pl-1.5 pr-4 font-bold transition-all ${
                    active ? "bg-primary text-white shadow-md shadow-primary/25" : "bg-surface-2"
                  }`}
                >
                  <Avatar person={p} size="sm" />
                  <span className="text-sm">{p.id === meId ? "Me" : p.name}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div>
        <p className="mb-1.5 px-1 text-xs font-bold text-muted">Family members — no login needed</p>
        {family.placeholders.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {family.placeholders.map((ph) => (
              <span
                key={ph.key}
                className="flex items-center gap-1.5 rounded-full bg-primary-soft py-1 pl-3 pr-1 text-xs font-bold text-primary"
              >
                {ph.name}
                <button
                  onClick={() => removePlaceholder(ph.key)}
                  aria-label={`Remove ${ph.name}`}
                  className="grid h-5 w-5 place-items-center rounded-full hover:bg-primary/20"
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
        )}
        {placeholderCandidates.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {placeholderCandidates.map((p) => (
              <button
                key={p.id}
                onClick={() => addExistingPlaceholder(p)}
                className="flex items-center gap-1.5 rounded-full bg-surface-2 py-1 pl-1 pr-3 text-xs font-bold text-muted"
              >
                <Avatar person={p} size="sm" />＋ {p.name}
              </button>
            ))}
          </div>
        )}
        <div className="flex items-center gap-2">
          <input
            placeholder="Add a name…"
            value={newMemberName}
            onChange={(e) => setNewMemberName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addPlaceholderName()}
            className="min-w-0 flex-1 rounded-full bg-surface-2 px-4 py-2 text-sm font-bold outline-none placeholder:font-semibold placeholder:text-muted"
          />
          <button
            onClick={addPlaceholderName}
            disabled={!newMemberName.trim()}
            className="rounded-full bg-primary px-4 py-2 text-sm font-bold text-white active:scale-95 disabled:opacity-40"
          >
            Add
          </button>
        </div>
      </div>
    </div>
  );
}

function TrashIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    </svg>
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
