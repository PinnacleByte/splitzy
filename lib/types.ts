export type Person = {
  id: string;
  name: string;
  /** tailwind gradient pair for the avatar, e.g. "from-violet-400 to-fuchsia-400" */
  color: string;
  /** free-form labels like "veg", "smoker" for quick participant selection */
  tags: string[];
};

export type Split = {
  personId: string;
  /** amount (in dollars) this person owes for the expense */
  amount: number;
};

export type SplitMethod = "equal" | "shares" | "nights" | "itemized";

/** A single line on an itemized bill, shared equally by its participants. */
export type ItemLine = {
  id: string;
  name: string;
  amount: number;
  participantIds: string[];
};

/** One person's presence window for a date-aware (nights) split. */
export type Stay = {
  personId: string;
  /** ISO date "YYYY-MM-DD" */
  from: string;
  to: string;
};

/**
 * A group-level hotel booking. The total `price` is spread per-night across the
 * booking window and shared among whoever was present each night, so the split
 * re-derives automatically as members join, leave, or change their dates.
 */
export type GroupStay = {
  checkIn: string;
  checkOut: string;
  price: number;
  /** who paid the hotel bill */
  paidBy: string;
  /** each member's presence window (defaults to the full booking) */
  stays: Stay[];
};

/** How an expense is divided. Discriminated by `method`. */
export type SplitConfig =
  | {
      method: "equal";
      participantIds: string[];
      /** when true, split once per household (couple/family) instead of per head:
       *  amount ÷ distinct units, then each unit's share ÷ its participating members */
      perHousehold?: boolean;
    }
  | { method: "shares"; shares: { personId: string; units: number }[] }
  | {
      method: "nights";
      bookingFrom: string;
      bookingTo: string;
      stays: Stay[];
    }
  | {
      method: "itemized";
      items: ItemLine[];
      /** tax/tip/fees, split proportionally to each person's item subtotal */
      extra: number;
      extraLabel?: string;
    };

export type Expense = {
  id: string;
  groupId: string;
  description: string;
  emoji: string;
  amount: number;
  /** person id who paid */
  paidBy: string;
  /** computed per-person shares — the source of truth for balances */
  splits: Split[];
  /** how the split was configured (for display + editing) */
  config: SplitConfig;
  /** which Add-Expense category produced it (for re-opening in edit) */
  category?: string;
  createdAt: number;
};

export type Settlement = {
  id: string;
  groupId: string;
  from: string; // person id who paid back
  to: string; // person id who received
  amount: number;
  createdAt: number;
};

/**
 * A named unit of members within a single group who settle as one wallet
 * (a couple or a family). Scoped to the group — not a permanent account link.
 * Members not in any household are "singles". Balances aggregate per household;
 * expense_splits stay per person, so this layer is purely additive.
 */
export type Household = {
  id: string;
  name: string;
  emoji: string;
  memberIds: string[];
};

export type Group = {
  id: string;
  name: string;
  emoji: string;
  memberIds: string[];
  createdAt: number;
  /** couples/families within the group; absent or empty means everyone is solo */
  households?: Household[];
  /** present when this is a "staying" group with a shared hotel booking */
  stay?: GroupStay;
};

export type AppState = {
  /** the current user's person id */
  meId: string;
  meEmail: string;
  people: Person[];
  groups: Group[];
  expenses: Expense[];
  settlements: Settlement[];
};
