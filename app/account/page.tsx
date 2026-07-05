"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { overallNet } from "@/lib/balances";
import { money } from "@/lib/format";
import { SUGGESTED_TAGS, tagEmoji, tagLabel } from "@/lib/tags";
import { Avatar } from "@/components/Avatar";
import { useTheme } from "@/lib/theme";
import { createClient } from "@/lib/supabase/client";

export default function AccountPage() {
  const { state, me, toggleTag } = useStore();
  const { theme, toggle } = useTheme();
  const router = useRouter();
  const net = overallNet(state);

  const signOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  return (
    <main className="safe-top flex flex-1 flex-col gap-6 px-5 pt-4">
      <h1 className="text-2xl font-black">Account</h1>

      <section className="flex flex-col items-center gap-3 rounded-4xl border border-border bg-surface p-6 shadow-sm">
        <Avatar person={me} size="lg" />
        <div className="text-center">
          <p className="text-lg font-extrabold">{me.name}</p>
          <p className="text-sm font-semibold text-muted">
            {net >= 0 ? "You are owed " : "You owe "}
            <span
              className={net >= 0 ? "text-positive" : "text-negative"}
            >
              {money(Math.abs(net))}
            </span>{" "}
            overall
          </p>
        </div>
        <div className="mt-2 grid w-full grid-cols-3 gap-2">
          <Stat label="Groups" value={state.groups.length} />
          <Stat label="Expenses" value={state.expenses.length} />
          <Stat label="Friends" value={state.people.length - 1} />
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <Row
          label="Appearance"
          value={theme === "dark" ? "Dark" : "Light"}
          onClick={toggle}
          icon="🌗"
        />
        <Row
          label="Sign out"
          value=""
          icon="👋"
          danger
          onClick={() => {
            if (confirm("Sign out of Splitzy?")) signOut();
          }}
        />
      </section>

      {/* Your profile tags */}
      <section className="flex flex-col gap-3 rounded-3xl border border-border bg-surface p-4 shadow-sm">
        <div>
          <h2 className="text-base font-extrabold">Your profile</h2>
          <p className="text-xs font-semibold text-muted">
            Used to auto-split expenses (e.g. only smokers pay for cigarettes).
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {SUGGESTED_TAGS.map((t) => {
            const on = me.tags.includes(t);
            return (
              <button
                key={t}
                onClick={() => toggleTag(me.id, t)}
                className={`rounded-full px-3 py-1 text-xs font-bold transition-all ${
                  on
                    ? "bg-primary-soft text-primary ring-1 ring-primary/30"
                    : "bg-surface-2 text-muted opacity-70"
                }`}
              >
                {tagEmoji(t)} {tagLabel(t)}
              </button>
            );
          })}
        </div>
        <Link
          href="/friends"
          className="mt-1 rounded-2xl bg-surface-2 py-2.5 text-center text-sm font-bold text-primary active:scale-[0.99]"
        >
          Manage friends &amp; their profiles →
        </Link>
      </section>

      <div className="rounded-3xl border border-dashed border-border bg-surface/60 p-5 text-center">
        <p className="text-2xl">📲</p>
        <p className="mt-1 font-bold">Install Splitzy</p>
        <p className="mt-1 text-sm text-muted">
          Add to your home screen for a full-screen app: use your browser's{" "}
          <b>Share → Add to Home Screen</b>.
        </p>
      </div>

      <p className="pb-4 text-center text-xs font-semibold text-muted">
        Splitzy · synced to your account
      </p>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-surface-2 p-3 text-center">
      <p className="text-xl font-black">{value}</p>
      <p className="text-[11px] font-bold text-muted">{label}</p>
    </div>
  );
}

function Row({
  label,
  value,
  icon,
  onClick,
  danger,
}: {
  label: string;
  value: string;
  icon: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 rounded-3xl border border-border bg-surface p-4 text-left shadow-sm active:scale-[0.99]"
    >
      <span className="grid h-10 w-10 place-items-center rounded-2xl bg-surface-2 text-lg">
        {icon}
      </span>
      <span className={`flex-1 font-bold ${danger ? "text-negative" : ""}`}>
        {label}
      </span>
      <span className="text-sm font-semibold text-muted">{value}</span>
    </button>
  );
}
