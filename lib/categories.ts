import type { Person } from "./types";

export type BucketKind = "vegfood" | "nonvegfood" | "alcohol" | "nonalcoholic" | "cigarettes" | "other";

export const BUCKET_DEFS: Record<
  BucketKind,
  { emoji: string; label: string; includeTag?: string; excludeTag?: string }
> = {
  vegfood: { emoji: "🥗", label: "Veg food" },
  nonvegfood: { emoji: "🍖", label: "Non-veg food", excludeTag: "veg" },
  alcohol: { emoji: "🍺", label: "Alcohol", includeTag: "drinker" },
  nonalcoholic: { emoji: "🥤", label: "Soft drinks", includeTag: "softdrinks" },
  cigarettes: { emoji: "🚬", label: "Cigarettes", includeTag: "smoker" },
  other: { emoji: "🎲", label: "Other" },
};

export type BillTemplate = {
  key: string;
  emoji: string;
  label: string;
  mode: "single" | "mixed";
  hint?: string;
  /** single-bill, no sub-choice (e.g. "Other") */
  bucket?: BucketKind;
  /** single-bill, pick one of these (e.g. Food → Veg/Non-veg) */
  subChoice?: BucketKind[];
  /** mixed-bill, the bucket rows to render */
  buckets?: BucketKind[];
};

export const SINGLE_TEMPLATES: BillTemplate[] = [
  { key: "food", emoji: "🍔", label: "Food", mode: "single", subChoice: ["vegfood", "nonvegfood"] },
  { key: "drinks", emoji: "🍹", label: "Drinks", mode: "single", subChoice: ["alcohol", "nonalcoholic"] },
  { key: "other", emoji: "🎲", label: "Other", mode: "single", bucket: "other", hint: "Split among everyone" },
];

export const MIXED_TEMPLATES: BillTemplate[] = [
  {
    key: "nightout",
    emoji: "🌆",
    label: "Night out",
    mode: "mixed",
    hint: "Food + drinks + smokes",
    buckets: ["nonvegfood", "vegfood", "alcohol", "cigarettes", "nonalcoholic"],
  },
  {
    key: "groceries",
    emoji: "🛒",
    label: "Groceries",
    mode: "mixed",
    hint: "Itemized, per shopper",
    buckets: ["nonvegfood", "vegfood", "alcohol", "cigarettes", "nonalcoholic", "other"],
  },
];

export const getTemplate = (key: string): BillTemplate | undefined =>
  SINGLE_TEMPLATES.find((t) => t.key === key) ?? MIXED_TEMPLATES.find((t) => t.key === key);

/** Label + emoji for any saved `Expense.category` key — a bucket kind or a template key. */
export function getCategoryMeta(key: string): { label: string; emoji: string } | undefined {
  if (key in BUCKET_DEFS) return BUCKET_DEFS[key as BucketKind];
  const t = getTemplate(key);
  return t ? { label: t.label, emoji: t.emoji } : undefined;
}

/** Member ids that carry a tag; falls back to everyone if nobody is tagged. */
export function membersWithTag(members: Person[], tag: string): string[] {
  const tagged = members.filter((m) => m.tags.includes(tag)).map((m) => m.id);
  return tagged.length ? tagged : members.map((m) => m.id);
}

/** Auto-select the member ids a bucket applies to, given the group's people. */
export function selectForBucket(kind: BucketKind, members: Person[]): string[] {
  const def = BUCKET_DEFS[kind];
  const all = members.map((m) => m.id);
  if (def.excludeTag) {
    const kept = members.filter((m) => !m.tags.includes(def.excludeTag!)).map((m) => m.id);
    return kept.length ? kept : all;
  }
  if (def.includeTag) return membersWithTag(members, def.includeTag);
  return all;
}
