import type { Person } from "./types";

export type Category = {
  key: string;
  emoji: string;
  label: string;
  /** how participants are auto-picked from the members */
  kind: "equal" | "buckets";
  /** only members WITH this tag are auto-selected (fallback: everyone) */
  includeTag?: string;
  /** members WITH this tag are auto-excluded */
  excludeTag?: string;
  hint?: string;
};

export const CATEGORIES: Category[] = [
  { key: "food", emoji: "🍔", label: "Only food", kind: "equal", hint: "Split among everyone" },
  { key: "mixed", emoji: "🌆", label: "Night out", kind: "buckets", hint: "Food + add-ons, auto-split" },
  { key: "nonveg", emoji: "🍖", label: "Non-veg meal", kind: "equal", excludeTag: "veg", hint: "Everyone except veg" },
  { key: "alcohol", emoji: "🍺", label: "Alcohol", kind: "equal", includeTag: "drinker", hint: "Drinkers only" },
  { key: "softdrinks", emoji: "🥤", label: "Soft drinks", kind: "equal", includeTag: "softdrinks", hint: "Whoever had them" },
  { key: "cigarettes", emoji: "🚬", label: "Cigarettes", kind: "equal", includeTag: "smoker", hint: "Smokers only" },
  { key: "groceries", emoji: "🛒", label: "Groceries", kind: "equal", hint: "Split among everyone" },
  { key: "misc", emoji: "🎲", label: "Misc", kind: "equal", hint: "Split among everyone" },
];

/**
 * The add-on buckets available inside a "Night out" expense. Whatever total is
 * left after these becomes the shared Food bucket (split among everyone).
 */
export const MIXED_BUCKETS: { key: string; emoji: string; label: string; tag: string }[] = [
  { key: "alcohol", emoji: "🍺", label: "Alcohol", tag: "drinker" },
  { key: "cigarettes", emoji: "🚬", label: "Cigarettes", tag: "smoker" },
  { key: "softdrinks", emoji: "🥤", label: "Soft drinks", tag: "softdrinks" },
];

export const getCategory = (key: string) => CATEGORIES.find((c) => c.key === key);

/** Member ids that carry a tag; falls back to everyone if nobody is tagged. */
export function membersWithTag(members: Person[], tag: string): string[] {
  const tagged = members.filter((m) => m.tags.includes(tag)).map((m) => m.id);
  return tagged.length ? tagged : members.map((m) => m.id);
}

/** Auto-select the member ids a category applies to, given the group's people. */
export function selectForCategory(cat: Category, members: Person[]): string[] {
  const all = members.map((m) => m.id);
  if (cat.excludeTag) {
    const kept = members.filter((m) => !m.tags.includes(cat.excludeTag!)).map((m) => m.id);
    return kept.length ? kept : all;
  }
  if (cat.includeTag) return membersWithTag(members, cat.includeTag);
  return all;
}
