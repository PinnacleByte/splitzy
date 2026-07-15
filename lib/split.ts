import type { Household, Split, SplitConfig } from "./types";

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Turn a map of raw (possibly fractional-cent) amounts into clean 2-decimal
 * splits whose sum exactly equals `total`. Leftover/again cents are handed to
 * the people with the largest raw share, which is the fairest bias.
 */
function roundToTotal(
  raw: { personId: string; amount: number }[],
  total: number,
): Split[] {
  const cents = raw.map((r) => ({
    personId: r.personId,
    c: Math.round(r.amount * 100),
    raw: r.amount,
  }));
  const target = Math.round(total * 100);
  let diff = target - cents.reduce((s, x) => s + x.c, 0);

  // order by raw amount desc so the biggest shares absorb rounding
  const order = [...cents].sort((a, b) => b.raw - a.raw);
  const step = diff > 0 ? 1 : -1;
  for (let i = 0; diff !== 0 && order.length; i = (i + 1) % order.length) {
    order[i].c += step;
    diff -= step;
  }

  return cents.map((c) => ({ personId: c.personId, amount: c.c / 100 }));
}

/** Even split across N participants (remainder cents distributed fairly). */
export function computeEqual(amount: number, participantIds: string[]): Split[] {
  if (participantIds.length === 0) return [];
  const each = amount / participantIds.length;
  return roundToTotal(
    participantIds.map((personId) => ({ personId, amount: each })),
    amount,
  );
}

/**
 * Equal split divided once per *household* rather than per head: the amount is
 * shared evenly across the distinct units among the participants (a single
 * counts as their own unit), then each unit's share is split evenly among its
 * participating members. computeEqual is reused at both levels, so the top-level
 * split sums to `amount` exactly and each unit's sub-split sums to its own share.
 */
export function computeEqualPerHousehold(
  amount: number,
  participantIds: string[],
  households: Household[],
): Split[] {
  const memberToHousehold: Record<string, string> = {};
  for (const h of households) for (const m of h.memberIds) memberToHousehold[m] = h.id;

  // group the selected participants by unit, preserving first-seen order
  const unitMembers: Record<string, string[]> = {};
  const unitOrder: string[] = [];
  for (const pid of participantIds) {
    const u = memberToHousehold[pid] ?? pid;
    if (!unitMembers[u]) {
      unitMembers[u] = [];
      unitOrder.push(u);
    }
    unitMembers[u].push(pid);
  }
  if (unitOrder.length === 0) return [];

  const perUnit = computeEqual(amount, unitOrder); // [{ personId: unitId, amount }]
  const unitAmount: Record<string, number> = {};
  for (const u of perUnit) unitAmount[u.personId] = u.amount;

  const splits: Split[] = [];
  for (const u of unitOrder) {
    for (const s of computeEqual(unitAmount[u], unitMembers[u])) splits.push(s);
  }
  return splits;
}

/** Weighted split by integer/float shares (e.g. portions). */
export function computeShares(
  amount: number,
  shares: { personId: string; units: number }[],
): Split[] {
  const active = shares.filter((s) => s.units > 0);
  const totalUnits = active.reduce((s, x) => s + x.units, 0);
  if (totalUnits <= 0) return [];
  return roundToTotal(
    active.map((s) => ({
      personId: s.personId,
      amount: (amount * s.units) / totalUnits,
    })),
    amount,
  );
}

const DAY = 86_400_000;
const parseDate = (iso: string) => Date.parse(`${iso}T00:00:00Z`);

/** Number of whole nights between two ISO dates (>= 0). */
export function nightsBetween(from: string, to: string): number {
  const a = parseDate(from);
  const b = parseDate(to);
  if (isNaN(a) || isNaN(b) || b <= a) return 0;
  return Math.round((b - a) / DAY);
}

/**
 * Date-aware split. The booking's cost is spread evenly across every night in
 * [bookingFrom, bookingTo); each night is then shared equally among whoever
 * was present that night. A night with nobody present falls back to everyone.
 */
export function computeNights(
  amount: number,
  bookingFrom: string,
  bookingTo: string,
  stays: { personId: string; from: string; to: string }[],
): Split[] {
  const totalNights = nightsBetween(bookingFrom, bookingTo);
  if (totalNights <= 0 || stays.length === 0) return [];

  const perNight = amount / totalNights;
  const raw: Record<string, number> = {};
  stays.forEach((s) => (raw[s.personId] = 0));

  const start = parseDate(bookingFrom);
  for (let n = 0; n < totalNights; n++) {
    const nightStart = start + n * DAY;
    const present = stays.filter(
      (s) =>
        parseDate(s.from) <= nightStart && parseDate(s.to) > nightStart,
    );
    const sharers = present.length ? present : stays;
    const share = perNight / sharers.length;
    sharers.forEach((s) => (raw[s.personId] += share));
  }

  return roundToTotal(
    Object.entries(raw).map(([personId, amount]) => ({ personId, amount })),
    amount,
  );
}

/** Itemized bill: each item split among its participants, extras pro-rated. */
export function computeItemized(
  items: { amount: number; participantIds: string[] }[],
  extra: number,
): { splits: Split[]; amount: number } {
  const subtotal = round2(items.reduce((s, it) => s + it.amount, 0));
  const total = round2(subtotal + extra);

  // Round each item to its own exact amount so a dish's cost is never off by a
  // cent — the remainder stays within that dish's own participants.
  const perPerson: Record<string, number> = {};
  const addExact = (splits: Split[]) => {
    for (const s of splits) perPerson[s.personId] = round2((perPerson[s.personId] ?? 0) + s.amount);
  };
  for (const it of items) {
    if (it.participantIds.length === 0) continue;
    addExact(computeEqual(it.amount, it.participantIds));
  }

  // distribute extras proportional to each person's item subtotal, rounded to `extra`
  if (extra !== 0) {
    const base = Object.values(perPerson).reduce((s, v) => s + v, 0);
    if (base > 0) {
      const extraSplits = roundToTotal(
        Object.entries(perPerson).map(([personId, v]) => ({
          personId,
          amount: (v / base) * extra,
        })),
        extra,
      );
      addExact(extraSplits);
    }
  }

  const splits = Object.entries(perPerson).map(([personId, amount]) => ({
    personId,
    amount: round2(amount),
  }));
  return { splits, amount: total };
}

/**
 * Single entry point: given a config (and the entered amount for methods that
 * need it), return the computed splits and the effective expense total.
 */
export function resolveExpense(
  config: SplitConfig,
  enteredAmount: number,
  households: Household[] = [],
): { splits: Split[]; amount: number } {
  switch (config.method) {
    case "equal":
      return {
        splits: config.perHousehold
          ? computeEqualPerHousehold(enteredAmount, config.participantIds, households)
          : computeEqual(enteredAmount, config.participantIds),
        amount: enteredAmount,
      };
    case "shares":
      return {
        splits: computeShares(enteredAmount, config.shares),
        amount: enteredAmount,
      };
    case "nights":
      return {
        splits: computeNights(
          enteredAmount,
          config.bookingFrom,
          config.bookingTo,
          config.stays,
        ),
        amount: enteredAmount,
      };
    case "itemized":
      return computeItemized(config.items, config.extra);
  }
}

export const METHOD_LABEL: Record<SplitConfig["method"], string> = {
  equal: "Split equally",
  shares: "Split by shares",
  nights: "Split by nights",
  itemized: "Itemized",
};

export const METHOD_EMOJI: Record<SplitConfig["method"], string> = {
  equal: "🟰",
  shares: "⚖️",
  nights: "🌙",
  itemized: "🧾",
};

/** Short human summary of a split, e.g. "By nights · 3 people". */
export function describeSplit(config: SplitConfig): string {
  switch (config.method) {
    case "equal":
      return `${config.perHousehold ? "Per household" : "Split equally"} · ${config.participantIds.length} people`;
    case "shares": {
      const active = config.shares.filter((s) => s.units > 0);
      return `By shares · ${active.length} people`;
    }
    case "nights":
      return `By nights · ${nightsBetween(config.bookingFrom, config.bookingTo)} nights`;
    case "itemized":
      return `Itemized · ${config.items.length} item${config.items.length === 1 ? "" : "s"}`;
  }
}
