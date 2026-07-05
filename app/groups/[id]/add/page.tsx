"use client";

import { Suspense, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useStore } from "@/lib/store";
import { resolveExpense } from "@/lib/split";
import type { Expense, Group, ItemLine, Person, SplitConfig } from "@/lib/types";
import { money } from "@/lib/format";
import {
  CATEGORIES,
  MIXED_BUCKETS,
  getCategory,
  selectForCategory,
  membersWithTag,
} from "@/lib/categories";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/Button";
import { Loading, NotFound } from "@/components/Screen";

const rid = () => Math.random().toString(36).slice(2, 9);
const round2 = (n: number) => Math.round(n * 100) / 100;

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

type Cat = string; // category key, or "advanced"

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

  const seed = useMemo(
    () => (editExpense ? initFromExpense(editExpense, memberIds, members) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const [step, setStep] = useState(editExpense ? 2 : 1);
  const [amount, setAmount] = useState(seed?.amount ?? "");
  const [paidBy, setPaidBy] = useState(seed?.paidBy ?? state.meId);
  const [category, setCategory] = useState<Cat | null>(seed?.category ?? null);
  const [description, setDescription] = useState(seed?.description ?? "");
  const [emoji, setEmoji] = useState(seed?.emoji ?? "🧾");

  // equal-category participants
  const [participants, setParticipants] = useState<string[]>(seed?.participants ?? memberIds);
  // "Night out" multi-bucket: food is the leftover, add-ons keyed by bucket
  const [foodSet, setFoodSet] = useState<string[]>(seed?.foodSet ?? memberIds);
  const [vegAmount, setVegAmount] = useState(seed?.vegAmount ?? "");
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
  const cat = category && category !== "advanced" ? getCategory(category) : null;

  const config: SplitConfig = useMemo(() => {
    if (category === "advanced") {
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
    if (cat?.kind === "buckets") {
      const addOns = MIXED_BUCKETS.map((b) => ({
        b,
        amt: parseFloat(bucketAmounts[b.key] || "") || 0,
      })).filter((x) => x.amt > 0);
      const addOnTotal = addOns.reduce((s, x) => s + x.amt, 0);
      const food = round2(enteredAmount - addOnTotal);
      const lines: ItemLine[] = [];

      if (food > 0.005) {
        const veg = Math.min(Math.max(parseFloat(vegAmount) || 0, 0), food);
        const vegPeople = foodSet.filter((id) => person(id).tags.includes("veg"));
        if (veg > 0.005 && vegPeople.length) {
          // diet-split: veg eaters cover the veg dishes, non-veg eaters the rest
          const nonVeg = round2(food - veg);
          const nonVegPeople = foodSet.filter((id) => !person(id).tags.includes("veg"));
          lines.push({ id: "vegfood", name: "Veg food", amount: veg, participantIds: vegPeople });
          if (nonVeg > 0.005 && nonVegPeople.length)
            lines.push({ id: "food", name: "Non-veg food", amount: nonVeg, participantIds: nonVegPeople });
        } else {
          lines.push({ id: "food", name: "Food", amount: food, participantIds: foodSet });
        }
      }

      addOns.forEach((x) =>
        lines.push({
          id: x.b.key,
          name: x.b.label,
          amount: x.amt,
          participantIds: bucketSets[x.b.key] ?? [],
        }),
      );
      return { method: "itemized", extra: 0, items: lines };
    }
    return { method: "equal", participantIds: participants };
  }, [category, cat, advMethod, units, items, extra, bucketAmounts, bucketSets, vegAmount, enteredAmount, foodSet, participants, person, memberIds]);

  const preview = useMemo(
    () => resolveExpense(config, enteredAmount),
    [config, enteredAmount],
  );
  const totalAmount = preview.amount;
  const shareOf = (pid: string) =>
    preview.splits.find((s) => s.personId === pid)?.amount ?? 0;

  // for "Night out": how much of the total is still unallocated (becomes Food)
  const addOnTotal = MIXED_BUCKETS.reduce(
    (s, b) => s + (parseFloat(bucketAmounts[b.key] || "") || 0),
    0,
  );
  const foodLeftover = round2(enteredAmount - addOnTotal);
  const overAllocated = cat?.kind === "buckets" && foodLeftover < -0.005;
  const vegMembers = members.some((m) => m.tags.includes("veg"));
  const vegNum = parseFloat(vegAmount) || 0;
  const vegOver = cat?.kind === "buckets" && vegNum > Math.max(0, foodLeftover) + 0.005;

  const step1Valid = enteredAmount > 0 && category !== null;
  const canSave =
    description.trim().length > 0 &&
    totalAmount > 0 &&
    preview.splits.length > 0 &&
    !overAllocated &&
    !vegOver;

  const chooseCategory = (key: Cat) => {
    setCategory(key);
    if (key === "advanced") {
      setEmoji("🧾");
      setDescription("");
      setUnits(Object.fromEntries(memberIds.map((m) => [m, 1])));
      setItems([{ id: rid(), name: "", amount: 0, participantIds: memberIds }]);
    } else {
      const c = getCategory(key)!;
      setEmoji(c.emoji);
      setDescription(c.label);
      if (c.kind === "equal") setParticipants(selectForCategory(c, members));
      else {
        setFoodSet(memberIds);
        setVegAmount("");
        setBucketAmounts({});
        setBucketSets(
          Object.fromEntries(MIXED_BUCKETS.map((b) => [b.key, membersWithTag(members, b.tag)])),
        );
      }
    }
  };

  const save = () => {
    if (!canSave) return;
    const data = {
      groupId: group.id,
      description: description.trim(),
      emoji,
      amount: totalAmount,
      paidBy,
      splits: preview.splits,
      config,
      category: category ?? undefined,
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
  const TITLES = editExpense ? ["Edit expense", "Edit split"] : ["Add expense", "Who's in?"];

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
          <span className="w-14 text-right text-sm font-bold text-muted">{step}/2</span>
        )}
      </header>

      <div className="mx-5 mt-3 h-1.5 overflow-hidden rounded-full bg-surface-2">
        <div
          className="h-full rounded-full bg-gradient-to-r from-primary to-primary-strong transition-all"
          style={{ width: `${(step / 2) * 100}%` }}
        />
      </div>

      <div className="flex flex-1 flex-col gap-6 px-5 pt-6">
        {/* STEP 1 — amount + paid by */}
        {step === 1 && (
          <>
            <div className="flex flex-col items-center gap-1 py-2">
              <div className="flex items-center gap-1">
                <span className="text-3xl font-black text-muted">$</span>
                <input
                  autoFocus
                  inputMode="decimal"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                  onKeyDown={(e) => e.key === "Enter" && step1Valid && setStep(2)}
                  className="w-48 bg-transparent text-center text-5xl font-black tracking-tight outline-none placeholder:text-border"
                />
              </div>
            </div>
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

            {/* category grid */}
            <section className="flex flex-col gap-3">
              <p className="px-1 text-sm font-bold text-muted">Category</p>
              <div className="grid grid-cols-2 gap-3">
                {CATEGORIES.map((c) => {
                  const sel = category === c.key;
                  return (
                    <button
                      key={c.key}
                      onClick={() => chooseCategory(c.key)}
                      className={`flex flex-col items-start gap-2 rounded-3xl border p-4 text-left shadow-sm transition-all ${
                        sel
                          ? "border-primary bg-primary-soft"
                          : "border-border bg-surface hover:border-primary/40"
                      }`}
                    >
                      <span className="grid h-11 w-11 place-items-center rounded-2xl bg-surface-2 text-2xl">
                        {c.emoji}
                      </span>
                      <span className="font-extrabold leading-tight">{c.label}</span>
                      <span className="text-[11px] font-semibold text-muted">{c.hint}</span>
                    </button>
                  );
                })}
              </div>
              <button
                onClick={() => chooseCategory("advanced")}
                className={`flex items-center gap-3 rounded-3xl border p-4 text-left ${
                  category === "advanced"
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
          </>
        )}

        {/* STEP 2 — who's in / adjust */}
        {step === 2 && category && (
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

            {/* EQUAL category */}
            {cat?.kind === "equal" && (
              <EqualPicker
                memberIds={memberIds}
                meId={state.meId}
                person={person}
                selected={participants}
                setSelected={setParticipants}
                shareOf={shareOf}
              />
            )}

            {/* NIGHT OUT — multi-bucket */}
            {cat?.kind === "buckets" && (
              <div className="flex flex-col gap-4">
                <p className="px-1 text-xs font-semibold text-muted">
                  Enter what was spent on each add-on — the rest is food.
                  ✨ Each bucket auto-picks people from their profiles; tap the chips to adjust for tonight.
                </p>

                {/* Food (leftover) */}
                <div className="rounded-2xl border border-border bg-surface p-3">
                  <div className="flex items-center justify-between">
                    <p className="font-bold">🍔 Food</p>
                    <span className={`font-black ${overAllocated ? "text-negative" : "text-positive"}`}>
                      {money(foodLeftover)}
                    </span>
                  </div>
                  {overAllocated ? (
                    <p className="mt-1 text-[11px] font-bold text-negative">
                      Add-ons exceed the total by {money(-foodLeftover)} — lower one.
                    </p>
                  ) : (
                    <>
                      <BucketToggles
                        memberIds={memberIds}
                        meId={state.meId}
                        person={person}
                        selected={foodSet}
                        setSelected={setFoodSet}
                      />
                      {vegMembers && (
                        <div className="mt-3 border-t border-border pt-3">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-bold">🥗 of which vegetarian</p>
                            <div className="flex items-center gap-1 rounded-full bg-surface-2 px-3 py-1.5">
                              <span className="text-sm font-black text-muted">$</span>
                              <input
                                inputMode="decimal"
                                placeholder="0"
                                value={vegAmount}
                                onChange={(e) => setVegAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                                className="w-16 bg-transparent text-right text-sm font-black outline-none"
                              />
                            </div>
                          </div>
                          {vegOver ? (
                            <p className="mt-1 text-[11px] font-bold text-negative">
                              Veg amount is more than the food total — lower it.
                            </p>
                          ) : vegNum > 0.005 ? (
                            <p className="mt-1 text-[11px] font-semibold text-muted">
                              Veg {money(vegNum)} → veg eaters · rest {money(round2(foodLeftover - vegNum))} → non-veg eaters
                            </p>
                          ) : (
                            <p className="mt-1 text-[11px] font-semibold text-muted">
                              Leave 0 if everyone shares the food.
                            </p>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* Add-on buckets */}
                {MIXED_BUCKETS.map((b) => {
                  const val = bucketAmounts[b.key] || "";
                  const active = (parseFloat(val) || 0) > 0;
                  const set = bucketSets[b.key] ?? [];
                  return (
                    <div key={b.key} className="rounded-2xl border border-border bg-surface p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-bold">
                          {b.emoji} {b.label}
                        </p>
                        <div className="flex items-center gap-1 rounded-full bg-surface-2 px-3 py-1.5">
                          <span className="text-sm font-black text-muted">$</span>
                          <input
                            inputMode="decimal"
                            placeholder="0"
                            value={val}
                            onChange={(e) =>
                              setBucketAmounts((prev) => ({ ...prev, [b.key]: e.target.value.replace(/[^0-9.]/g, "") }))
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
                          setSelected={(v) => setBucketSets((prev) => ({ ...prev, [b.key]: v }))}
                        />
                      )}
                    </div>
                  );
                })}

                {preview.splits.length > 0 && !overAllocated && (
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
            {category === "advanced" && (
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

        {/* footer continue on step 1 */}
        {step === 1 && (
          <div className="mt-auto pb-4">
            <Button onClick={() => setStep(2)} disabled={!step1Valid} size="lg" fullWidth>
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
}: {
  memberIds: string[];
  meId: string;
  person: (id: string) => Person;
  selected: string[];
  setSelected: (v: string[]) => void;
  shareOf: (pid: string) => number;
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="px-1 text-[11px] font-semibold text-muted">
        ✨ Auto-picked from profiles — tap anyone to adjust for tonight.
      </p>
    <ul className="flex flex-col gap-2">
      {memberIds.map((pid) => {
        const p = person(pid);
        const checked = selected.includes(pid);
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
              <span className="flex-1 text-left font-bold">{pid === meId ? "You" : p.name}</span>
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
  category: Cat;
  participants?: string[];
  foodSet?: string[];
  vegAmount?: string;
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
      category: "advanced",
      advMethod: "shares",
      units: Object.fromEntries(cfg.shares.map((s) => [s.personId, s.units])),
    };
  }
  if (cfg.method !== "itemized") {
    // "equal" (or any non-itemized) → an equal split among its participants
    const participants = cfg.method === "equal" ? cfg.participantIds : memberIds;
    return { ...base, category: e.category ?? "misc", participants };
  }

  // itemized — "Night out" if its lines map onto food/veg + known buckets, else advanced
  const mixedIds = ["food", "vegfood", ...MIXED_BUCKETS.map((b) => b.key)];
  const isMixed =
    e.category === "mixed" ||
    (!e.category && cfg.items.length > 0 && cfg.items.every((it) => mixedIds.includes(it.id)));

  if (isMixed) {
    const foodItem = cfg.items.find((it) => it.id === "food");
    const vegItem = cfg.items.find((it) => it.id === "vegfood");
    // foodSet = everyone who shared any food (veg + non-veg diners)
    const foodSet = Array.from(
      new Set([...(vegItem?.participantIds ?? []), ...(foodItem?.participantIds ?? [])]),
    );
    const bucketAmounts: Record<string, string> = {};
    const bucketSets: Record<string, string[]> = {};
    MIXED_BUCKETS.forEach((b) => {
      const it = cfg.items.find((x) => x.id === b.key);
      if (it) {
        bucketAmounts[b.key] = String(it.amount);
        bucketSets[b.key] = it.participantIds;
      } else {
        bucketSets[b.key] = membersWithTag(members, b.tag);
      }
    });
    return {
      ...base,
      category: "mixed",
      foodSet: foodSet.length ? foodSet : memberIds,
      vegAmount: vegItem ? String(vegItem.amount) : "",
      bucketAmounts,
      bucketSets,
    };
  }

  return {
    ...base,
    category: "advanced",
    advMethod: "itemized",
    items: cfg.items.length
      ? cfg.items
      : [{ id: rid(), name: "", amount: 0, participantIds: memberIds }],
    extra: cfg.extra ? String(cfg.extra) : "",
  };
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
