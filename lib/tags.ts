import type { Person } from "./types";

/** Suggested tags with an emoji + color, used for quick participant picking. */
export const TAG_META: Record<string, { emoji: string; label: string }> = {
  "non-veg": { emoji: "🍗", label: "Non-veg" },
  veg: { emoji: "🥗", label: "Veg" },
  drinker: { emoji: "🍺", label: "Alcohol" },
  softdrinks: { emoji: "🥤", label: "Soft drinks" },
  smoker: { emoji: "🚬", label: "Smoker" },
};

export const SUGGESTED_TAGS = Object.keys(TAG_META);

export const tagLabel = (t: string) => TAG_META[t]?.label ?? t;
export const tagEmoji = (t: string) => TAG_META[t]?.emoji ?? "🏷️";

/** Every tag actually used by the given people, in suggested-first order. */
export function tagsInUse(people: Person[]): string[] {
  const set = new Set<string>();
  people.forEach((p) => p.tags.forEach((t) => set.add(t)));
  const ordered = SUGGESTED_TAGS.filter((t) => set.has(t));
  const extra = [...set].filter((t) => !SUGGESTED_TAGS.includes(t));
  return [...ordered, ...extra];
}
