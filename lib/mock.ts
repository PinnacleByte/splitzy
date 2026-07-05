import type { AppState, Expense, SplitConfig } from "./types";
import { resolveExpense } from "./split";

const DAY = 86_400_000;
const now = Date.now();

// ids
const you = "p_you";
const alex = "p_alex";
const sam = "p_sam";
const mia = "p_mia";
const leo = "p_leo";

/** build an expense, computing splits + amount from its config */
function mk(
  e: Omit<Expense, "splits" | "amount"> & { amount: number },
): Expense {
  const { splits, amount } = resolveExpense(e.config, e.amount);
  return { ...e, splits, amount };
}

export const seedState: AppState = {
  meId: you,
  meEmail: "you@example.com",
  people: [
    { id: you, name: "You", color: "from-violet-500 to-fuchsia-500", tags: ["non-veg", "drinker"] },
    { id: alex, name: "Alex", color: "from-sky-400 to-cyan-400", tags: ["non-veg", "drinker"] },
    { id: sam, name: "Sam", color: "from-amber-400 to-orange-400", tags: ["non-veg", "smoker"] },
    { id: mia, name: "Mia", color: "from-rose-400 to-pink-400", tags: ["veg"] },
    { id: leo, name: "Leo", color: "from-emerald-400 to-teal-400", tags: ["non-veg", "smoker", "drinker"] },
  ],
  groups: [
    {
      id: "g_trip",
      name: "Goa Trip",
      emoji: "🏖️",
      memberIds: [you, alex, sam, mia],
      createdAt: now - 20 * DAY,
      stay: {
        checkIn: "2026-06-10",
        checkOut: "2026-06-15",
        price: 700,
        paidBy: you,
        stays: [
          { personId: you, from: "2026-06-10", to: "2026-06-15" },
          { personId: alex, from: "2026-06-10", to: "2026-06-15" },
          { personId: sam, from: "2026-06-10", to: "2026-06-13" },
          { personId: mia, from: "2026-06-13", to: "2026-06-15" },
        ],
      },
    },
    {
      id: "g_flat",
      name: "Flatmates",
      emoji: "🏠",
      memberIds: [you, sam, leo],
      createdAt: now - 90 * DAY,
    },
    {
      id: "g_dinner",
      name: "Friday Dinners",
      emoji: "🍜",
      memberIds: [you, alex, mia, leo],
      createdAt: now - 8 * DAY,
    },
  ],
  expenses: [
    mk({
      id: "e2",
      groupId: "g_trip",
      description: "Scooter rentals",
      emoji: "🛵",
      amount: 96,
      paidBy: alex,
      createdAt: now - 17 * DAY,
      config: { method: "equal", participantIds: [you, alex, sam, mia] },
    }),
    mk({
      id: "e3",
      groupId: "g_trip",
      description: "Seafood shack dinner",
      emoji: "🦐",
      amount: 132.4,
      paidBy: sam,
      createdAt: now - 16 * DAY,
      config: { method: "equal", participantIds: [you, alex, sam, mia] },
    }),
    mk({
      id: "e4",
      groupId: "g_flat",
      description: "Electricity bill",
      emoji: "💡",
      amount: 75,
      paidBy: sam,
      createdAt: now - 6 * DAY,
      config: { method: "equal", participantIds: [you, sam, leo] },
    }),
    mk({
      id: "e5",
      groupId: "g_flat",
      description: "Groceries — Costco run",
      emoji: "🛒",
      amount: 143.7,
      paidBy: you,
      createdAt: now - 3 * DAY,
      config: { method: "equal", participantIds: [you, sam, leo] },
    }),
    // Itemized: Mia is veg (no meat/beer), only some drink
    mk({
      id: "e6",
      groupId: "g_dinner",
      description: "Ramen night",
      emoji: "🍜",
      amount: 0, // computed from items
      paidBy: mia,
      createdAt: now - 2 * DAY,
      config: {
        method: "itemized",
        extra: 8,
        extraLabel: "Tax & tip",
        items: [
          { id: "i1", name: "Tonkotsu ramen ×3", amount: 45, participantIds: [you, alex, leo] },
          { id: "i2", name: "Veg ramen", amount: 13, participantIds: [mia] },
          { id: "i3", name: "Beers ×3", amount: 21, participantIds: [you, alex, leo] },
          { id: "i4", name: "Gyoza (shared)", amount: 12, participantIds: [you, alex, mia, leo] },
        ],
      },
    }),
    mk({
      id: "e7",
      groupId: "g_dinner",
      description: "Dessert & boba",
      emoji: "🧋",
      amount: 24.5,
      paidBy: you,
      createdAt: now - 2 * DAY,
      config: { method: "equal", participantIds: [you, alex, mia, leo] },
    }),
  ],
  settlements: [
    {
      id: "s1",
      groupId: "g_trip",
      from: "p_mia",
      to: "p_you",
      amount: 60,
      createdAt: now - 12 * DAY,
    },
  ],
};
