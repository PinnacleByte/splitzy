import { initials } from "@/lib/format";
import type { Person } from "@/lib/types";

const sizes = {
  sm: "h-8 w-8 text-[11px]",
  md: "h-10 w-10 text-sm",
  lg: "h-14 w-14 text-lg",
};

export function Avatar({
  person,
  size = "md",
  ring = false,
}: {
  person: Person;
  size?: keyof typeof sizes;
  ring?: boolean;
}) {
  return (
    <span
      className={`inline-grid place-items-center rounded-full bg-gradient-to-br ${person.color} ${sizes[size]} font-bold text-white shadow-sm ${
        ring ? "ring-2 ring-surface" : ""
      }`}
      title={person.name}
    >
      {initials(person.name)}
    </span>
  );
}

export function AvatarStack({
  people,
  max = 4,
  size = "sm",
}: {
  people: Person[];
  max?: number;
  size?: keyof typeof sizes;
}) {
  const shown = people.slice(0, max);
  const extra = people.length - shown.length;
  return (
    <div className="flex items-center -space-x-2">
      {shown.map((p) => (
        <Avatar key={p.id} person={p} size={size} ring />
      ))}
      {extra > 0 && (
        <span
          className={`inline-grid ${sizes[size]} place-items-center rounded-full bg-surface-2 font-bold text-muted ring-2 ring-surface`}
        >
          +{extra}
        </span>
      )}
    </div>
  );
}
