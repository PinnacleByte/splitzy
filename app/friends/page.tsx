"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import { friendNet } from "@/lib/balances";
import { money } from "@/lib/format";
import { SUGGESTED_TAGS, tagEmoji, tagLabel } from "@/lib/tags";
import { Avatar } from "@/components/Avatar";
import { InviteButton } from "@/components/InviteButton";

export default function FriendsPage() {
  const { state, person, toggleTag } = useStore();
  const [open, setOpen] = useState<string | null>(null);

  const friends = state.people
    .filter((p) => p.id !== state.meId)
    .map((p) => ({ p, net: friendNet(state, state.meId, p.id) }))
    .sort((a, b) => Math.abs(b.net) - Math.abs(a.net));

  const owed = friends.reduce((s, f) => s + (f.net > 0 ? f.net : 0), 0);
  const owe = friends.reduce((s, f) => s + (f.net < 0 ? -f.net : 0), 0);

  return (
    <main className="safe-top flex flex-1 flex-col gap-5 px-5 pt-4">
      <h1 className="text-2xl font-black">Friends</h1>

      <InviteButton />

      {/* summary */}
      <section className="grid grid-cols-2 gap-3">
        <div className="rounded-3xl border border-border bg-surface p-4 shadow-sm">
          <p className="text-xs font-bold text-muted">You are owed</p>
          <p className="mt-1 text-2xl font-black text-positive">{money(owed)}</p>
        </div>
        <div className="rounded-3xl border border-border bg-surface p-4 shadow-sm">
          <p className="text-xs font-bold text-muted">You owe</p>
          <p className="mt-1 text-2xl font-black text-negative">{money(owe)}</p>
        </div>
      </section>

      {friends.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-border bg-surface/60 p-8 text-center">
          <p className="text-4xl">🧑‍🤝‍🧑</p>
          <p className="mt-2 font-bold">No friends yet</p>
          <p className="mt-1 text-sm text-muted">Send an invite link above to bring them onto Splitzy.</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {friends.map(({ p, net }) => {
            const settled = Math.abs(net) < 0.005;
            const owedYou = net > 0;
            const isOpen = open === p.id;
            return (
              <li key={p.id} className="rounded-3xl border border-border bg-surface p-4 shadow-sm">
                <button
                  onClick={() => setOpen(isOpen ? null : p.id)}
                  className="flex w-full items-center gap-3 text-left"
                >
                  <Avatar person={p} size="md" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-extrabold">{p.name}</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {p.tags.length ? (
                        p.tags.map((t) => (
                          <span key={t} className="text-[11px] font-bold text-muted">
                            {tagEmoji(t)}
                          </span>
                        ))
                      ) : (
                        <span className="text-[11px] font-semibold text-muted">no profile set</span>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    {settled ? (
                      <span className="text-xs font-bold text-muted">settled up</span>
                    ) : (
                      <>
                        <p className={`text-[11px] font-bold ${owedYou ? "text-positive" : "text-negative"}`}>
                          {owedYou ? "owes you" : "you owe"}
                        </p>
                        <p className={`text-base font-black ${owedYou ? "text-positive" : "text-negative"}`}>
                          {money(Math.abs(net))}
                        </p>
                      </>
                    )}
                  </div>
                </button>

                {isOpen && (
                  <div className="mt-3 border-t border-border pt-3">
                    <p className="mb-2 text-xs font-bold text-muted">Profile — used to auto-split expenses</p>
                    <div className="flex flex-wrap gap-1.5">
                      {SUGGESTED_TAGS.map((t) => {
                        const on = p.tags.includes(t);
                        return (
                          <button
                            key={t}
                            onClick={() => toggleTag(p.id, t)}
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
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
