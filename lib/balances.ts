import type { AppState, Expense, Group, GroupStay, Household, Settlement } from "./types";
import { computeNights } from "./split";

const round2 = (n: number) => Math.round(n * 100) / 100;

// =========================================================================
// Household aggregation
//
// A "unit" is either a household (keyed by its id) or a lone person (keyed by
// their person id — household and person ids are distinct uuids, so they never
// collide). These helpers collapse the per-person balances the rest of the app
// computes into per-unit views so a couple/family settles as one wallet, while
// the underlying expense_splits stay strictly per person.
// =========================================================================

/** person id → the household id they belong to (only members that are in one). */
export function memberHousehold(households: Household[] = []): Record<string, string> {
  const map: Record<string, string> = {};
  for (const h of households) for (const pid of h.memberIds) map[pid] = h.id;
  return map;
}

/** The unit id a person settles under: their household id, or their own id. */
export function unitOf(personId: string, households: Household[] = []): string {
  return memberHousehold(households)[personId] ?? personId;
}

/** Collapse a per-person net map into a per-unit net map (households merged). */
export function householdNet(
  net: Record<string, number>,
  households: Household[] = [],
): Record<string, number> {
  const map = memberHousehold(households);
  const out: Record<string, number> = {};
  for (const [pid, v] of Object.entries(net)) {
    const unit = map[pid] ?? pid;
    out[unit] = round2((out[unit] ?? 0) + v);
  }
  return out;
}

/**
 * Merge per-person gross flows into per-unit flows: intra-household debts are
 * dropped (a couple never sees "Dad owes Mom"), and parallel debts between the
 * same two units are summed.
 */
export function householdFlows(
  flows: Transfer[],
  households: Household[] = [],
): Transfer[] {
  const map = memberHousehold(households);
  const unit = (id: string) => map[id] ?? id;
  // merged[from][to] = total the `from` unit owes the `to` unit
  const merged: Record<string, Record<string, number>> = {};
  for (const f of flows) {
    const from = unit(f.from);
    const to = unit(f.to);
    if (from === to) continue; // same household — internal, not a real debt
    (merged[from] ??= {})[to] = round2((merged[from][to] ?? 0) + f.amount);
  }
  const out: Transfer[] = [];
  for (const from of Object.keys(merged)) {
    for (const to of Object.keys(merged[from])) {
      if (merged[from][to] > 0.005) out.push({ from, to, amount: merged[from][to] });
    }
  }
  return out.sort((a, b) => b.amount - a.amount);
}

/** Aggregate per-person paid/share stats into per-unit stats. */
export function householdStats(
  stats: MemberStat[],
  households: Household[] = [],
): MemberStat[] {
  const map = memberHousehold(households);
  const byUnit: Record<string, MemberStat> = {};
  const order: string[] = [];
  for (const s of stats) {
    const unit = map[s.personId] ?? s.personId;
    if (!byUnit[unit]) {
      byUnit[unit] = { personId: unit, paid: 0, share: 0 };
      order.push(unit);
    }
    byUnit[unit].paid = round2(byUnit[unit].paid + s.paid);
    byUnit[unit].share = round2(byUnit[unit].share + s.share);
  }
  return order.map((u) => byUnit[u]);
}

/**
 * Turn a unit-level transfer into a concrete person→person settlement. Charges
 * the debtor-side member who owes the most and credits the creditor-side member
 * owed the most, so recording it keeps individual balances sensible even though
 * the household shares one wallet.
 */
export function resolveUnitTransfer(
  from: string,
  to: string,
  perPersonNet: Record<string, number>,
  households: Household[] = [],
): { from: string; to: string } {
  const membersOf = (unit: string) =>
    households.find((h) => h.id === unit)?.memberIds ?? [unit];
  const fromMembers = membersOf(from);
  const toMembers = membersOf(to);
  const payer = fromMembers.reduce(
    (best, pid) => ((perPersonNet[pid] ?? 0) < (perPersonNet[best] ?? 0) ? pid : best),
    fromMembers[0],
  );
  const payee = toMembers.reduce(
    (best, pid) => ((perPersonNet[pid] ?? 0) > (perPersonNet[best] ?? 0) ? pid : best),
    toMembers[0],
  );
  return { from: payer, to: payee };
}

/** Net effect of a group's hotel booking: payer is owed, each guest owes their nights. */
export function stayNet(
  stay: GroupStay,
  memberIds: string[],
): Record<string, number> {
  const net: Record<string, number> = {};
  memberIds.forEach((id) => (net[id] = 0));
  net[stay.paidBy] = (net[stay.paidBy] ?? 0) + stay.price;
  const splits = computeNights(
    stay.price,
    stay.checkIn,
    stay.checkOut,
    stay.stays,
  );
  for (const s of splits) net[s.personId] = (net[s.personId] ?? 0) - s.amount;
  return net;
}

/** Full net for a group: expenses + settlements + hotel stay (if any). */
export function groupNet(
  group: Group,
  expenses: Expense[],
  settlements: Settlement[],
): Record<string, number> {
  const net = groupBalances(group.memberIds, expenses, settlements);
  if (group.stay) {
    const sn = stayNet(group.stay, group.memberIds);
    for (const id of Object.keys(sn)) net[id] = round2((net[id] ?? 0) + sn[id]);
  }
  return net;
}

/**
 * Net balance per person within a single group.
 * Positive  => the person is owed money (they are a creditor).
 * Negative  => the person owes money (they are a debtor).
 */
export function groupBalances(
  memberIds: string[],
  expenses: Expense[],
  settlements: Settlement[],
): Record<string, number> {
  const net: Record<string, number> = {};
  memberIds.forEach((id) => (net[id] = 0));

  for (const e of expenses) {
    // the payer fronted the whole amount
    net[e.paidBy] = (net[e.paidBy] ?? 0) + e.amount;
    // everyone owes their share
    for (const s of e.splits) {
      net[s.personId] = (net[s.personId] ?? 0) - s.amount;
    }
  }

  for (const s of settlements) {
    // `from` paid `to`, reducing what `from` owes and what `to` is owed
    net[s.from] = (net[s.from] ?? 0) + s.amount;
    net[s.to] = (net[s.to] ?? 0) - s.amount;
  }

  for (const id of Object.keys(net)) net[id] = round2(net[id]);
  return net;
}

export type Transfer = { from: string; to: string; amount: number };

/**
 * Minimum-cash-flow debt simplification. Greedily matches the largest
 * creditor with the largest debtor until everything nets to zero.
 */
export function simplifyDebts(net: Record<string, number>): Transfer[] {
  const creditors = Object.entries(net)
    .filter(([, v]) => v > 0.005)
    .map(([id, v]) => ({ id, amt: v }));
  const debtors = Object.entries(net)
    .filter(([, v]) => v < -0.005)
    .map(([id, v]) => ({ id, amt: -v }));

  const transfers: Transfer[] = [];

  while (creditors.length && debtors.length) {
    creditors.sort((a, b) => b.amt - a.amt);
    debtors.sort((a, b) => b.amt - a.amt);
    const c = creditors[0];
    const d = debtors[0];
    const amount = round2(Math.min(c.amt, d.amt));

    transfers.push({ from: d.id, to: c.id, amount });
    c.amt = round2(c.amt - amount);
    d.amt = round2(d.amt - amount);

    if (c.amt <= 0.005) creditors.shift();
    if (d.amt <= 0.005) debtors.shift();
  }

  return transfers;
}

/**
 * Gross directional debts, WITHOUT cancelling opposite-direction debts.
 * Returns one transfer per ordered (debtor → creditor) pair that still has a
 * positive balance. Unlike simplifyDebts, both A→B and B→A can appear — this is
 * the "auto-balance off" view where each debt is shown in full.
 *
 * Recorded settlements are subtracted from the matching direction (a payment
 * from X to Y reduces what X owes Y); a settlement with no matching gross debt
 * is ignored, since this view is informational rather than a net position.
 */
export function grossFlows(
  group: Group,
  expenses: Expense[],
  settlements: Settlement[],
): Transfer[] {
  // owed[creditor][debtor] = amount the debtor owes the creditor
  const owed: Record<string, Record<string, number>> = {};
  const add = (debtor: string, creditor: string, amt: number) => {
    if (debtor === creditor || amt <= 0) return;
    (owed[creditor] ??= {})[debtor] = (owed[creditor][debtor] ?? 0) + amt;
  };

  for (const e of expenses) {
    for (const s of e.splits) add(s.personId, e.paidBy, s.amount);
  }
  if (group.stay) {
    const splits = computeNights(
      group.stay.price,
      group.stay.checkIn,
      group.stay.checkOut,
      group.stay.stays,
    );
    for (const s of splits) add(s.personId, group.stay.paidBy, s.amount);
  }
  for (const st of settlements) {
    if (owed[st.to]?.[st.from] != null) owed[st.to][st.from] -= st.amount;
  }

  const flows: Transfer[] = [];
  for (const creditor of Object.keys(owed)) {
    for (const debtor of Object.keys(owed[creditor])) {
      const amount = round2(owed[creditor][debtor]);
      if (amount > 0.005) flows.push({ from: debtor, to: creditor, amount });
    }
  }
  return flows.sort((a, b) => b.amount - a.amount);
}

export type MemberStat = { personId: string; paid: number; share: number };

/**
 * Per-person totals for a group: what each member fronted (`paid`) and their
 * share of consumption (`share`), across all expenses plus the hotel stay.
 * Settlements are excluded — they are repayments, not spending.
 */
export function groupStats(group: Group, expenses: Expense[]): MemberStat[] {
  const paid: Record<string, number> = {};
  const share: Record<string, number> = {};
  group.memberIds.forEach((id) => {
    paid[id] = 0;
    share[id] = 0;
  });

  for (const e of expenses) {
    paid[e.paidBy] = (paid[e.paidBy] ?? 0) + e.amount;
    for (const s of e.splits) share[s.personId] = (share[s.personId] ?? 0) + s.amount;
  }
  if (group.stay) {
    paid[group.stay.paidBy] = (paid[group.stay.paidBy] ?? 0) + group.stay.price;
    const splits = computeNights(
      group.stay.price,
      group.stay.checkIn,
      group.stay.checkOut,
      group.stay.stays,
    );
    for (const s of splits) share[s.personId] = (share[s.personId] ?? 0) + s.amount;
  }

  return group.memberIds.map((id) => ({
    personId: id,
    paid: round2(paid[id] ?? 0),
    share: round2(share[id] ?? 0),
  }));
}

/** Split an amount evenly across N people, distributing rounding remainders. */
export function splitEvenly(amount: number, personIds: string[]) {
  const n = personIds.length;
  if (n === 0) return [];
  const base = Math.floor((amount * 100) / n) / 100;
  const shares = personIds.map((personId) => ({ personId, amount: base }));
  // distribute the leftover cents one at a time
  let remainder = Math.round(amount * 100 - base * 100 * n);
  for (let i = 0; remainder > 0; i = (i + 1) % n, remainder--) {
    shares[i].amount = round2(shares[i].amount + 0.01);
  }
  return shares;
}

/** The current user's overall net across every group. */
export function overallNet(state: AppState): number {
  let total = 0;
  for (const g of state.groups) {
    const exp = state.expenses.filter((e) => e.groupId === g.id);
    const set = state.settlements.filter((s) => s.groupId === g.id);
    const net = groupNet(g, exp, set);
    total += net[state.meId] ?? 0;
  }
  return round2(total);
}

/**
 * Direct pairwise balance between two people across every shared group.
 * Positive => `otherId` owes `meId`; negative => `meId` owes `otherId`.
 */
export function friendNet(
  state: AppState,
  meId: string,
  otherId: string,
): number {
  let net = 0;
  for (const g of state.groups) {
    if (!g.memberIds.includes(meId) || !g.memberIds.includes(otherId)) continue;

    for (const e of state.expenses.filter((x) => x.groupId === g.id)) {
      if (e.paidBy === meId) {
        net += e.splits.find((s) => s.personId === otherId)?.amount ?? 0;
      } else if (e.paidBy === otherId) {
        net -= e.splits.find((s) => s.personId === meId)?.amount ?? 0;
      }
    }

    if (g.stay) {
      const splits = computeNights(
        g.stay.price,
        g.stay.checkIn,
        g.stay.checkOut,
        g.stay.stays,
      );
      if (g.stay.paidBy === meId) {
        net += splits.find((s) => s.personId === otherId)?.amount ?? 0;
      } else if (g.stay.paidBy === otherId) {
        net -= splits.find((s) => s.personId === meId)?.amount ?? 0;
      }
    }

    for (const s of state.settlements.filter((x) => x.groupId === g.id)) {
      if (s.from === otherId && s.to === meId) net -= s.amount;
      else if (s.from === meId && s.to === otherId) net += s.amount;
    }
  }
  return round2(net);
}
