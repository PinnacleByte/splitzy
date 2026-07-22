"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useStore } from "@/lib/store";
import { AvatarStack } from "@/components/Avatar";

const items = [
  { href: "/", label: "Groups", icon: GroupsIcon },
  { href: "/friends", label: "Friends", icon: FriendsIcon },
  { href: "/insights", label: "Insights", icon: InsightsIcon },
  { href: "/account", label: "Account", icon: AccountIcon },
];

export function BottomNav() {
  const pathname = usePathname();
  const [sheet, setSheet] = useState(false);

  if (pathname.startsWith("/login") || pathname.startsWith("/invite")) return null;

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  // left two items, then center Add, then right two
  const left = items.slice(0, 2);
  const right = items.slice(2);

  return (
    <>
      {sheet && <AddSheet onClose={() => setSheet(false)} />}

      <nav className="safe-bottom pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-4">
        <div className="pointer-events-auto flex w-full max-w-md items-center justify-around rounded-full border border-border bg-surface/80 px-2 py-2 shadow-[0_12px_40px_rgba(0,0,0,0.14)] backdrop-blur-xl">
          {left.map((it) => (
            <NavItem key={it.href} {...it} active={isActive(it.href)} />
          ))}

          {/* raised center Add button */}
          <div className="flex flex-1 justify-center">
            <button
              onClick={() => setSheet(true)}
              aria-label="Add"
              className="-mt-8 grid h-16 w-16 place-items-center rounded-full bg-linear-to-br from-primary to-primary-strong text-white shadow-lg shadow-primary/40 ring-4 ring-bg transition-transform active:scale-90"
            >
              <PlusIcon />
            </button>
          </div>

          {right.map((it) => (
            <NavItem key={it.href} {...it} active={isActive(it.href)} />
          ))}
        </div>
      </nav>
    </>
  );
}

function NavItem({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  icon: () => React.ReactNode;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={`flex flex-1 flex-col items-center gap-1 rounded-full py-1.5 text-[11px] font-bold transition-colors ${
        active ? "text-primary" : "text-muted hover:text-foreground"
      }`}
    >
      <span
        className={`grid h-9 w-9 place-items-center rounded-full transition-colors ${
          active ? "bg-primary-soft" : ""
        }`}
      >
        <Icon />
      </span>
      {label}
    </Link>
  );
}

function AddSheet({ onClose }: { onClose: () => void }) {
  const { state, person } = useStore();
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-pop" onClick={onClose} />
      <div className="safe-bottom animate-pop pointer-events-auto relative mx-4 mb-4 w-full max-w-md rounded-4xl border border-border bg-surface p-5 shadow-2xl">
        <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-border" />
        <h2 className="mb-3 text-lg font-black">Add</h2>

        <Link
          href="/new"
          onClick={onClose}
          className="flex items-center gap-3 rounded-3xl bg-linear-to-br from-primary to-primary-strong p-4 text-white shadow-md shadow-primary/25 active:scale-[0.99]"
        >
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-white/20 text-2xl">✨</span>
          <div className="flex-1">
            <p className="font-extrabold">Create a group</p>
            <p className="text-xs font-semibold text-white/80">A trip, flat, dinners…</p>
          </div>
          <span className="text-xl">→</span>
        </Link>

        {state.groups.length > 0 && (
          <>
            <p className="mb-2 mt-4 px-1 text-sm font-bold text-muted">Add expense to…</p>
            <ul className="no-scrollbar flex max-h-64 flex-col gap-2 overflow-y-auto">
              {state.groups.map((g) => (
                <li key={g.id}>
                  <Link
                    href={`/groups/${g.id}/add`}
                    onClick={onClose}
                    className="flex items-center gap-3 rounded-2xl border border-border bg-surface-2 p-3 active:scale-[0.99]"
                  >
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-surface text-lg">
                      {g.emoji}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-bold">{g.name}</span>
                    <AvatarStack people={g.memberIds.map(person)} max={3} />
                    <span className="ml-1 font-black text-muted">＋</span>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}

function GroupsIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function FriendsIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87M18 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function InsightsIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3v18h18" />
      <rect x="7" y="11" width="3" height="6" rx="1" />
      <rect x="13" y="7" width="3" height="10" rx="1" />
    </svg>
  );
}

function AccountIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
