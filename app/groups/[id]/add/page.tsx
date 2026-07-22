"use client";

import { Suspense, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useStore } from "@/lib/store";
import { resolveExpense } from "@/lib/split";
import type { Expense, Group, Household, ItemLine, Person, SplitConfig } from "@/lib/types";
import { money } from "@/lib/format";
import {
  BUCKET_DEFS,
  SINGLE_TEMPLATES,
  MIXED_TEMPLATES,
  getTemplate,
  selectForBucket,
  type BucketKind,
} from "@/lib/categories";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/Button";
import { Loading, NotFound } from "@/components/Screen";

const rid = () => Math.random().toString(36).slice(2, 9);
const BUCKET_KEYS = Object.keys(BUCKET_DEFS) as BucketKind[];
const isBucketKind = (v?: string): v is BucketKind => !!v && (BUCKET_KEYS as string[]).includes(v);

export default function AddExpensePage() {
  return (
    <Suspense fallback={<Loading />}>
      <AddExpenseGate />
    </Suspense>
  );
}

function AddExpenseGate() {
  const { id } = useParams<{ id: string }>();
  const editId = useSearchParams().get("edit");
  const { state, hydrated } = useStore();
  const group = state.groups.find((g) => g.id === id);
  if (!hydrated) return <Loading />;
  if (!group) return <NotFound what="group" />;
  const editExpense = editId
    ? state.expenses.find((e) => e.id === editId && e.groupId === group.id)
    : undefined;
  // key forces a fresh mount (and fresh seed) when switching which expense we edit
  return <AddExpenseWizard key={editExpense?.id ?? "new"} group={group} editExpense={editExpense} />;
}

type BillMode = "single" | "mixed";

function AddExpenseWizard({
  group,
  editExpense,
}: {
  group: Group;
  editExpense?: Expense;
}) {
  const router = useRouter();
  const { state, person, addExpense, updateExpense, deleteExpense } = useStore();
  const memberIds = group.memberIds;
  const members = memberIds.map(person);
  const households = group.households ?? [];

  const seed = useMemo(
    () => (editExpense ? initFromExpense(editExpense, memberIds, members) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const [step, setStep] = useState(editExpense ? 3 : 1);
  const [amount, setAmount] = useState(seed?.amount ?? "");
  const [paidBy, setPaidBy] = useState(seed?.paidBy ?? state.meId);
  const [billMode, setBillMode] = useState<BillMode | null>(seed?.billMode ?? null);
  const [template, setTemplate] = useState<string | null>(seed?.template ?? null);
  const [bucketKind, setBucketKind] = useState<BucketKind | null>(seed?.bucketKind ?? null);
  const [description, setDescription] = useState(seed?.description ?? "");
  const [emoji, setEmoji] = useState(seed?.emoji ?? "🧾");

  // single-bill participants (equal split)
  const [participants, setParticipants] = useState<string[]>(seed?.participants ?? memberIds);
  // split the equal bill once per household (couple/family) instead of per head
  const [perHousehold, setPerHousehold] = useState(seed?.perHousehold ?? false);
  // mixed-bill buckets, keyed by BucketKind
  const [bucketAmounts, setBucketAmounts] = useState<Record<string, string>>(seed?.bucketAmounts ?? {});
  const [bucketSets, setBucketSets] = useState<Record<string, string[]>>(seed?.bucketSets ?? {});
  // advanced
  const [advMethod, setAdvMethod] = useState<"shares" | "itemized">(seed?.advMethod ?? "shares");
  const [units, setUnits] = useState<Record<string, number>>(
    seed?.units ?? Object.fromEntries(memberIds.map((m) => [m, 1])),
  );
  const [items, setItems] = useState<ItemLine[]>(
    seed?.items ?? [{ id: rid(), name: "", amount: 0, participantIds: memberIds }],
  );
  const [extra, setExtra] = useState(seed?.extra ?? "");

  const enteredAmount = parseFloat(amount) || 0;
  const tmpl = template && template !== "advanced" ? getTemplate(template) ?? null : null;

  const config: SplitConfig = useMemo(() => {
    if (template === "advanced") {
      if (advMethod === "shares")
        return {
          method: "shares",
          shares: memberIds.map((m) => ({ personId: m, units: units[m] || 0 })),
        };
      return {
        method: "itemized",
        items: items.filter((it) => it.name.trim() || it.amount > 0),
        extra: parseFloat(extra) || 0,
        extraLabel: "Tax & tip",
      };
    }
    if (billMode === "mixed" && tmpl?.buckets) {
      const lines: ItemLine[] = tmpl.buckets
        .map((k) => ({ k, amt: parseFloat(bucketAmounts[k] || "") || 0 }))
        .filter((x) => x.amt > 0)
        .map((x) => ({
          id: x.k,
          name: BUCKET_DEFS[x.k].label,
          amount: x.amt,
          participantIds: bucketSets[x.k] ?? [],
        }));
      return { method: "itemized", extra: 0, items: lines };
    }
    return {
      method: "equal",
      participantIds: participants,
      ...(perHousehold ? { perHousehold: true } : {}),
    };
  }, [template, billMode, tmpl, advMethod, units, items, extra, bucketAmounts, bucketSets, participants, perHousehold, memberIds]);

  const preview = useMemo(
    () => resolveExpense(config, enteredAmount, households),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [config, enteredAmount, JSON.stringify(households)],
  );
  const totalAmount = preview.amount;
  const shareOf = (pid: string) =>
    preview.splits.find((s) => s.personId === pid)?.amount ?? 0;

  const step2Valid =
    billMode === "mixed"
      ? template !== null
      : template === "advanced"
        ? enteredAmount > 0
        : enteredAmount > 0 && template !== null && (!tmpl?.subChoice || bucketKind !== null);
  const canSave = description.trim().length > 0 && totalAmount > 0 && preview.splits.length > 0;

  const chooseBillMode = (mode: BillMode) => {
    if (mode !== billMode) {
      setTemplate(null);
      setBucketKind(null);
    }
    setBillMode(mode);
    setStep(2);
  };

  const chooseTemplate = (key: string) => {
    const changingTemplate = key !== template;
    setTemplate(key);
    if (key === "advanced") {
      setBucketKind(null);
      setEmoji("🧾");
      setDescription("");
      setUnits(Object.fromEntries(memberIds.map((m) => [m, 1])));
      setItems([{ id: rid(), name: "", amount: 0, participantIds: memberIds }]);
      return;
    }
    const t = getTemplate(key)!;
    if (t.mode === "mixed") {
      setBucketKind(null);
      setEmoji(t.emoji);
      setDescription(t.label);
      setBucketAmounts({});
      setBucketSets(Object.fromEntries((t.buckets ?? []).map((k) => [k, selectForBucket(k, members)])));
      return;
    }
    if (t.bucket) {
      setBucketKind(t.bucket);
      setEmoji(t.emoji);
      setDescription(t.label);
      setParticipants(selectForBucket(t.bucket, members));
      return;
    }
    // Food / Drinks — wait for the Veg/Non-veg or Alcoholic/Non-alcoholic sub-choice
    if (changingTemplate) setBucketKind(null);
  };

  const chooseBucketKind = (kind: BucketKind) => {
    setBucketKind(kind);
    const def = BUCKET_DEFS[kind];
    setEmoji(def.emoji);
    setDescription(def.label);
    setParticipants(selectForBucket(kind, members));
  };

  const save = () => {
    if (!canSave) return;
    const categoryKey =
      template === "advanced" ? "advanced" : billMode === "mixed" ? template! : bucketKind ?? "other";
    const data = {
      groupId: group.id,
      description: description.trim(),
      emoji,
      amount: totalAmount,
      paidBy,
      splits: preview.splits,
      config,
      category: categoryKey,
    };
    if (editExpense) updateExpense(editExpense.id, data);
    else addExpense(data);
    router.push(`/groups/${group.id}`);
  };

  const remove = () => {
    if (editExpense && confirm(`Delete "${editExpense.description}"?`)) {
      deleteExpense(editExpense.id);
      router.push(`/groups/${group.id}`);
    }
  };

  const back = () => (step > 1 ? setStep(step - 1) : router.back());
  const TITLES = editExpense
    ? ["Edit expense", "Edit expense", "Edit split"]
    : ["Bill type", "Add expense", "Who's in?"];

  return (
    <main className="flex flex-1 flex-col">
      <header className="safe-top flex items-center justify-between px-5 pt-4">
        <button onClick={back} className="font-bold text-muted active:scale-95">
          {step === 1 ? "Cancel" : "Back"}
        </button>
        <h1 className="font-extrabold">{TITLES[step - 1]}</h1>
        {editExpense ? (
          <button onClick={remove} className="w-14 text-right text-sm font-bold text-negative active:scale-95">
            Delete
          </button>
        ) : (
          <span className="w-14 text-right text-sm font-bold text-muted">{step}/3</span>
        )}
      </header>

      <div className="mx-5 mt-3 h-1.5 overflow-hidden rounded-full bg-surface-2">
        <div
          className="h-full rounded-full bg-linear-to-r from-primary to-primary-strong transition-all"
          style={{ width: `${(step / 3) * 100}%` }}
        />
      </div>

      <div className="flex flex-1 flex-col gap-6 px-5 pt-6">
        {/* STEP 1 — single bill or mixed bill? */}
        {step === 1 && (
          <div className="flex flex-1 flex-col justify-center gap-3 pb-10">
            <p className="mb-1 px-1 text-center text-sm font-bold text-muted">What kind of bill is this?</p>
            <button
              onClick={() => chooseBillMode("single")}
              className="flex items-center gap-3 rounded-3xl border border-border bg-surface p-4 text-left shadow-sm transition-all hover:border-primary/40 active:scale-[0.99]"
            >
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-surface-2 text-2xl">🧾</span>
              <div className="flex-1">
                <p className="font-extrabold">Single bill</p>
                <p className="text-[11px] font-semibold text-muted">One purpose — food, drinks, or something else</p>
              </div>
              <span className="text-primary">→</span>
            </button>
            <button
              onClick={() => chooseBillMode("mixed")}
              className="flex items-center gap-3 rounded-3xl border border-border bg-surface p-4 text-left shadow-sm transition-all hover:border-primary/40 active:scale-[0.99]"
            >
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-surface-2 text-2xl">🧺</span>
              <div className="flex-1">
                <p className="font-extrabold">Mixed bill</p>
                <p className="text-[11px] font-semibold text-muted">Splits across food, drinks, smokes — auto-tallied</p>
              </div>
              <span className="text-primary">→</span>
            </button>
          </div>
        )}

        {/* STEP 2 — amount (single only) + paid by + template */}
        {step === 2 && billMode && (
          <>
            {billMode === "single" && (
              <div className="flex flex-col items-center gap-1 py-2">
                <div className="flex items-center gap-1">
                  <span className="text-3xl font-black text-muted">$</span>
                  <input
                    autoFocus
                    inputMode="decimal"
                    placeholder="0.00"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                    onKeyDown={(e) => e.key === "Enter" && step2Valid && setStep(3)}
                    className="w-48 bg-transparent text-center text-5xl font-black tracking-tight outline-none placeholder:text-border"
                  />
                </div>
              </div>
            )}

            <section>
              <p className="mb-2 px-1 text-sm font-bold text-muted">Paid by</p>
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
            </section>

            {billMode === "single" ? (
              <section className="flex flex-col gap-3">
                <p className="px-1 text-sm font-bold text-muted">Category</p>
                {SINGLE_TEMPLATES.map((t) => {
                  const sel = template === t.key;
                  return (
                    <div key={t.key} className="flex flex-col gap-2">
                      <button
                        onClick={() => chooseTemplate(t.key)}
                        className={`flex items-center gap-3 rounded-3xl border p-4 text-left shadow-sm transition-all ${
                          sel
                            ? "border-primary bg-primary-soft"
                            : "border-border bg-surface hover:border-primary/40"
                        }`}
                      >
                        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-surface-2 text-2xl">
                          {t.emoji}
                        </span>
                        <div className="flex-1">
                          <p className="font-extrabold leading-tight">{t.label}</p>
                          <p className="text-[11px] font-semibold text-muted">
                            {t.hint ?? (t.subChoice ? "Choose below" : "")}
                          </p>
                        </div>
                      </button>
                      {sel && t.subChoice && (
                        <div className="flex gap-2 pl-1">
                          {t.subChoice.map((k) => {
                            const def = BUCKET_DEFS[k];
                            const active = bucketKind === k;
                            return (
                              <button
                                key={k}
                                onClick={() => chooseBucketKind(k)}
                                className={`flex-1 rounded-2xl border px-3 py-2.5 text-center text-sm font-bold transition-all ${
                                  active
                                    ? "border-primary bg-primary-soft text-primary"
                                    : "border-border bg-surface text-foreground"
                                }`}
                              >
                                {def.emoji} {def.label}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
                <button
                  onClick={() => chooseTemplate("advanced")}
                  className={`flex items-center gap-3 rounded-3xl border p-4 text-left ${
                    template === "advanced"
                      ? "border-primary bg-primary-soft"
                      : "border-dashed border-border bg-surface/60"
                  }`}
                >
                  <span className="grid h-11 w-11 place-items-center rounded-2xl bg-surface-2 text-2xl">⚙️</span>
                  <div className="flex-1">
                    <p className="font-extrabold">Custom / advanced</p>
                    <p className="text-[11px] font-semibold text-muted">By shares, or an itemized bill</p>
                  </div>
                  <span className="text-primary">→</span>
                </button>
              </section>
            ) : (
              <section className="flex flex-col gap-3">
                <p className="px-1 text-sm font-bold text-muted">Category</p>
                {MIXED_TEMPLATES.map((t) => {
                  const sel = template === t.key;
                  return (
                    <button
                      key={t.key}
                      onClick={() => chooseTemplate(t.key)}
                      className={`flex items-center gap-3 rounded-3xl border p-4 text-left shadow-sm transition-all ${
                        sel
                          ? "border-primary bg-primary-soft"
                          : "border-border bg-surface hover:border-primary/40"
                      }`}
                    >
                      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-surface-2 text-2xl">
                        {t.emoji}
                      </span>
                      <div className="flex-1">
                        <p className="font-extrabold leading-tight">{t.label}</p>
                        <p className="text-[11px] font-semibold text-muted">{t.hint}</p>
                      </div>
                    </button>
                  );
                })}
              </section>
            )}
          </>
        )}

        {/* STEP 3 — who's in / adjust */}
        {step === 3 && template && (
          <section className="flex flex-col gap-4">
            {/* description + emoji */}
            <div className="flex items-center gap-3 rounded-3xl border border-border bg-surface p-2 shadow-sm">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-surface-2 text-2xl">
                {emoji}
              </span>
              <input
                placeholder="Add a note…"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="flex-1 bg-transparent text-base font-bold outline-none placeholder:font-semibold placeholder:text-muted"
              />
              <span className="pr-3 font-black">{money(totalAmount)}</span>
            </div>

            {/* SINGLE bill — equal split among the auto-picked bucket */}
            {billMode === "single" && template !== "advanced" && (
              <EqualPicker
                memberIds={memberIds}
                meId={state.meId}
                person={person}
                selected={participants}
                setSelected={setParticipants}
                shareOf={shareOf}
                households={households}
                perHousehold={perHousehold}
                setPerHousehold={setPerHousehold}
              />
            )}

            {/* MIXED bill — one row per bucket that applies */}
            {billMode === "mixed" && tmpl?.buckets && (
              <div className="flex flex-col gap-4">
                <p className="px-1 text-xs font-semibold text-muted">
                  Enter what was spent on each part that applies — skip the rest.
                  ✨ Each bucket auto-picks people from their profiles; tap the chips to adjust for tonight.
                </p>
                {tmpl.buckets.map((k) => {
                  const def = BUCKET_DEFS[k];
                  const val = bucketAmounts[k] || "";
                  const active = (parseFloat(val) || 0) > 0;
                  const set = bucketSets[k] ?? [];
                  return (
                    <div key={k} className="rounded-2xl border border-border bg-surface p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-bold">
                          {def.emoji} {def.label}
                        </p>
                        <div className="flex items-center gap-1 rounded-full bg-surface-2 px-3 py-1.5">
                          <span className="text-sm font-black text-muted">$</span>
                          <input
                            inputMode="decimal"
                            placeholder="0"
                            value={val}
                            onChange={(e) =>
                              setBucketAmounts((prev) => ({ ...prev, [k]: e.target.value.replace(/[^0-9.]/g, "") }))
                            }
                            className="w-16 bg-transparent text-right text-sm font-black outline-none"
                          />
                        </div>
                      </div>
                      {active && (
                        <BucketToggles
                          memberIds={memberIds}
                          meId={state.meId}
                          person={person}
                          selected={set}
                          setSelected={(v) => setBucketSets((prev) => ({ ...prev, [k]: v }))}
                        />
                      )}
                    </div>
                  );
                })}

                {preview.splits.length > 0 && (
                  <div className="flex flex-col gap-1.5 rounded-2xl bg-surface-2 p-3">
                    <p className="mb-1 text-xs font-bold text-muted">Each person pays</p>
                    {preview.splits.map((s) => (
                      <div key={s.personId} className="flex items-center gap-2 text-sm">
                        <Avatar person={person(s.personId)} size="sm" />
                        <span className="flex-1 font-bold">
                          {s.personId === state.meId ? "You" : person(s.personId).name}
                        </span>
                        <span className="font-black">{money(s.amount)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ADVANCED */}
            {template === "advanced" && (
              <AdvancedEditor
                memberIds={memberIds}
                meId={state.meId}
                person={person}
                method={advMethod}
                setMethod={setAdvMethod}
                units={units}
                setUnits={setUnits}
                items={items}
                setItems={setItems}
                extra={extra}
                setExtra={setExtra}
                enteredAmount={enteredAmount}
                shareOf={shareOf}
              />
            )}

            <Button onClick={save} disabled={!canSave} size="lg" fullWidth className="mb-4 mt-1">
              Save expense
            </Button>
          </section>
        )}

        {/* footer continue on step 2 */}
        {step === 2 && (
          <div className="mt-auto pb-4">
            <Button onClick={() => setStep(3)} disabled={!step2Valid} size="lg" fullWidth>
              Continue
            </Button>
          </div>
        )}
      </div>
    </main>
  );
}

/* ---------- pickers ---------- */

function EqualPicker({
  memberIds,
  meId,
  person,
  selected,
  setSelected,
  shareOf,
  households,
  perHousehold,
  setPerHousehold,
}: {
  memberIds: string[];
  meId: string;
  person: (id: string) => Person;
  selected: string[];
  setSelected: (v: string[]) => void;
  shareOf: (pid: string) => number;
  households: Household[];
  perHousehold: boolean;
  setPerHousehold: (v: boolean) => void;
}) {
  const householdOf = (pid: string) => households.find((h) => h.memberIds.includes(pid));
  // distinct households among the currently selected participants
  const unitCount = new Set(
    selected.map((pid) => householdOf(pid)?.id ?? pid),
  ).size;

  return (
    <div className="flex flex-col gap-2">
      {households.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <div className="grid grid-cols-2 gap-1 rounded-full bg-surface-2 p-1">
            {(
              [
                [false, "🧑 Per person"],
                [true, "👪 Per household"],
              ] as const
            ).map(([val, label]) => (
              <button
                key={label}
                onClick={() => setPerHousehold(val)}
                className={`rounded-full py-2 text-sm font-bold transition-all ${
                  perHousehold === val ? "bg-surface text-foreground shadow-sm" : "text-muted"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {perHousehold && (
            <p className="px-1 text-[11px] font-semibold text-muted">
              Divided once across {unitCount} {unitCount === 1 ? "unit" : "units"} (each couple/family
              counts as one), then shared within each household.
            </p>
          )}
        </div>
      )}
      <p className="px-1 text-[11px] font-semibold text-muted">
        ✨ Auto-picked from profiles — tap anyone to adjust for tonight.
      </p>
    <ul className="flex flex-col gap-2">
      {memberIds.map((pid) => {
        const p = person(pid);
        const checked = selected.includes(pid);
        const hh = perHousehold ? householdOf(pid) : undefined;
        return (
          <li key={pid}>
            <button
              onClick={() =>
                setSelected(checked ? selected.filter((x) => x !== pid) : [...selected, pid])
              }
              className={`flex w-full items-center gap-3 rounded-2xl border p-3 transition-all ${
                checked ? "border-primary/30 bg-surface" : "border-border bg-surface/50 opacity-60"
              }`}
            >
              <Avatar person={p} size="sm" />
              <span className="flex min-w-0 flex-1 flex-col text-left">
                <span className="truncate font-bold">{pid === meId ? "You" : p.name}</span>
                {hh && (
                  <span className="truncate text-[11px] font-semibold text-muted">
                    {hh.emoji} {hh.name}
                  </span>
                )}
              </span>
              {checked && <span className="text-sm font-black text-muted">{money(shareOf(pid))}</span>}
              <Check checked={checked} />
            </button>
          </li>
        );
      })}
    </ul>
    </div>
  );
}

function BucketToggles({
  memberIds,
  meId,
  person,
  selected,
  setSelected,
}: {
  memberIds: string[];
  meId: string;
  person: (id: string) => Person;
  selected: string[];
  setSelected: (v: string[]) => void;
}) {
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {memberIds.map((pid) => {
        const p = person(pid);
        const on = selected.includes(pid);
        return (
          <button
            key={pid}
            onClick={() => setSelected(on ? selected.filter((x) => x !== pid) : [...selected, pid])}
            className={`flex items-center gap-1.5 rounded-full py-1 pl-1 pr-3 text-xs font-bold transition-all ${
              on ? "bg-primary-soft text-primary ring-1 ring-primary/30" : "bg-surface-2 text-muted opacity-70"
            }`}
          >
            <Avatar person={p} size="sm" />
            {pid === meId ? "You" : p.name}
          </button>
        );
      })}
    </div>
  );
}

function AdvancedEditor({
  memberIds,
  meId,
  person,
  method,
  setMethod,
  units,
  setUnits,
  items,
  setItems,
  extra,
  setExtra,
  enteredAmount,
  shareOf,
}: {
  memberIds: string[];
  meId: string;
  person: (id: string) => Person;
  method: "shares" | "itemized";
  setMethod: (m: "shares" | "itemized") => void;
  units: Record<string, number>;
  setUnits: (u: Record<string, number>) => void;
  items: ItemLine[];
  setItems: (v: ItemLine[] | ((p: ItemLine[]) => ItemLine[])) => void;
  extra: string;
  setExtra: (v: string) => void;
  enteredAmount: number;
  shareOf: (pid: string) => number;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-1 rounded-full bg-surface-2 p-1">
        {(["shares", "itemized"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMethod(m)}
            className={`rounded-full py-2 text-sm font-bold capitalize transition-all ${
              method === m ? "bg-surface text-foreground shadow-sm" : "text-muted"
            }`}
          >
            {m === "shares" ? "⚖️ Shares" : "🧾 Itemized"}
          </button>
        ))}
      </div>

      {method === "shares" && (
        <ul className="flex flex-col gap-2">
          {memberIds.map((pid) => {
            const p = person(pid);
            const u = units[pid] || 0;
            return (
              <li
                key={pid}
                className={`flex items-center gap-3 rounded-2xl border p-3 transition-all ${
                  u > 0 ? "border-primary/30 bg-surface" : "border-border bg-surface/50 opacity-60"
                }`}
              >
                <Avatar person={p} size="sm" />
                <span className="flex-1 font-bold">{pid === meId ? "You" : p.name}</span>
                {u > 0 && <span className="text-sm font-black text-muted">{money(shareOf(pid))}</span>}
                <Stepper value={u} onChange={(v) => setUnits({ ...units, [pid]: v })} />
              </li>
            );
          })}
        </ul>
      )}

      {method === "itemized" && (
        <div className="flex flex-col gap-3">
          <ul className="flex flex-col gap-3">
            {items.map((it) => (
              <li key={it.id} className="rounded-2xl border border-border bg-surface p-3 shadow-sm">
                <div className="flex items-center gap-2">
                  <input
                    placeholder="Item name"
                    value={it.name}
                    onChange={(e) =>
                      setItems((prev) => prev.map((x) => (x.id === it.id ? { ...x, name: e.target.value } : x)))
                    }
                    className="min-w-0 flex-1 bg-transparent font-bold outline-none placeholder:font-semibold placeholder:text-muted"
                  />
                  <div className="flex items-center gap-1 rounded-full bg-surface-2 px-3 py-1.5">
                    <span className="text-sm font-black text-muted">$</span>
                    <input
                      inputMode="decimal"
                      placeholder="0"
                      value={it.amount ? String(it.amount) : ""}
                      onChange={(e) =>
                        setItems((prev) =>
                          prev.map((x) =>
                            x.id === it.id
                              ? { ...x, amount: parseFloat(e.target.value.replace(/[^0-9.]/g, "")) || 0 }
                              : x,
                          ),
                        )
                      }
                      className="w-16 bg-transparent text-right text-sm font-black outline-none"
                    />
                  </div>
                  {items.length > 1 && (
                    <button
                      onClick={() => setItems((prev) => prev.filter((x) => x.id !== it.id))}
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted hover:bg-negative-soft hover:text-negative"
                    >
                      ✕
                    </button>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {memberIds.map((pid) => {
                    const p = person(pid);
                    const on = it.participantIds.includes(pid);
                    return (
                      <button
                        key={pid}
                        onClick={() =>
                          setItems((prev) =>
                            prev.map((x) =>
                              x.id === it.id
                                ? {
                                    ...x,
                                    participantIds: on
                                      ? x.participantIds.filter((y) => y !== pid)
                                      : [...x.participantIds, pid],
                                  }
                                : x,
                            ),
                          )
                        }
                        className={`flex items-center gap-1 rounded-full py-1 pl-1 pr-2.5 text-xs font-bold transition-all ${
                          on ? "bg-primary-soft text-primary" : "bg-surface-2 text-muted opacity-70"
                        }`}
                      >
                        <Avatar person={p} size="sm" />
                        {pid === meId ? "You" : p.name}
                      </button>
                    );
                  })}
                </div>
              </li>
            ))}
          </ul>
          <button
            onClick={() => setItems((prev) => [...prev, { id: rid(), name: "", amount: 0, participantIds: memberIds }])}
            className="rounded-2xl border border-dashed border-border bg-surface/50 py-3 text-sm font-bold text-primary active:scale-[0.99]"
          >
            + Add item
          </button>
          <div className="flex items-center gap-2 rounded-2xl border border-border bg-surface p-3">
            <span className="flex-1 text-sm font-bold text-muted">Tax &amp; tip (optional)</span>
            <div className="flex items-center gap-1 rounded-full bg-surface-2 px-3 py-1.5">
              <span className="text-sm font-black text-muted">$</span>
              <input
                inputMode="decimal"
                placeholder="0"
                value={extra}
                onChange={(e) => setExtra(e.target.value.replace(/[^0-9.]/g, ""))}
                className="w-16 bg-transparent text-right text-sm font-black outline-none"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- edit: reconstruct wizard state from a saved expense ---------- */

type WizardSeed = {
  amount: string;
  paidBy: string;
  description: string;
  emoji: string;
  billMode: BillMode;
  template: string;
  bucketKind?: BucketKind;
  participants?: string[];
  perHousehold?: boolean;
  bucketAmounts?: Record<string, string>;
  bucketSets?: Record<string, string[]>;
  advMethod?: "shares" | "itemized";
  units?: Record<string, number>;
  items?: ItemLine[];
  extra?: string;
};

function initFromExpense(e: Expense, memberIds: string[], members: Person[]): WizardSeed {
  const base = { amount: String(e.amount), paidBy: e.paidBy, description: e.description, emoji: e.emoji };
  const cfg = e.config;

  if (cfg.method === "shares") {
    return {
      ...base,
      billMode: "single",
      template: "advanced",
      advMethod: "shares",
      units: Object.fromEntries(cfg.shares.map((s) => [s.personId, s.units])),
    };
  }

  if (cfg.method === "equal") {
    const bucketKind: BucketKind = isBucketKind(e.category) ? e.category : "other";
    const template =
      bucketKind === "vegfood" || bucketKind === "nonvegfood"
        ? "food"
        : bucketKind === "alcohol" || bucketKind === "nonalcoholic"
          ? "drinks"
          : "other";
    return {
      ...base,
      billMode: "single",
      template,
      bucketKind,
      participants: cfg.participantIds,
      perHousehold: cfg.perHousehold ?? false,
    };
  }

  if (cfg.method === "itemized") {
    // "nightout" / "groceries" (or the legacy "mixed" key) → a mixed bill
    const mixedTemplateKey =
      e.category === "nightout" || e.category === "groceries"
        ? e.category
        : e.category === "mixed"
          ? "nightout"
          : undefined;

    if (mixedTemplateKey) {
      const mt = getTemplate(mixedTemplateKey)!;
      const bucketAmounts: Record<string, string> = {};
      const bucketSets: Record<string, string[]> = {};
      (mt.buckets ?? []).forEach((k) => {
        const it = cfg.items.find((x) => x.id === k);
        if (it) {
          bucketAmounts[k] = String(it.amount);
          bucketSets[k] = it.participantIds;
        } else {
          bucketSets[k] = selectForBucket(k, members);
        }
      });
      return {
        ...base,
        billMode: "mixed",
        template: mixedTemplateKey,
        bucketAmounts,
        bucketSets,
      };
    }

    return {
      ...base,
      billMode: "single",
      template: "advanced",
      advMethod: "itemized",
      items: cfg.items.length
        ? cfg.items
        : [{ id: rid(), name: "", amount: 0, participantIds: memberIds }],
      extra: cfg.extra ? String(cfg.extra) : "",
    };
  }

  // fallback (e.g. a "nights" config, which this wizard doesn't author) — treat as a plain equal split
  return { ...base, billMode: "single", template: "other", bucketKind: "other", participants: memberIds };
}

/* ---------- small bits ---------- */

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

function Stepper({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-2 rounded-full bg-surface-2 p-1">
      <button
        onClick={() => onChange(Math.max(0, value - 1))}
        className="grid h-7 w-7 place-items-center rounded-full bg-surface font-black text-muted active:scale-90"
      >
        −
      </button>
      <span className="w-5 text-center font-black tabular-nums">{value}</span>
      <button
        onClick={() => onChange(value + 1)}
        className="grid h-7 w-7 place-items-center rounded-full bg-primary font-black text-white active:scale-90"
      >
        +
      </button>
    </div>
  );
}
