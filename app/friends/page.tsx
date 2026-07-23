"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import { friendNet } from "@/lib/balances";
import { money } from "@/lib/format";
import { SUGGESTED_TAGS, tagEmoji, tagLabel } from "@/lib/tags";
import { Avatar } from "@/components/Avatar";
import { AddFriendForm } from "@/components/AddFriendForm";

export default function FriendsPage() {
  const { state, toggleTag, removeFriend } = useStore();
  const [open, setOpen] = useState<string | null>(null);
  // id of the person whose "remove" confirm step is showing
  const [confirming, setConfirming] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const closeConfirm = () => {
    setConfirming(null);
    setRemoveError(null);
  };

  const doRemove = async (personId: string) => {
    setRemoving(true);
    setRemoveError(null);
    const { error } = await removeFriend(personId);
    setRemoving(false);
    if (error) setRemoveError(error);
    else closeConfirm();
  };

  const friends = state.people
    .filter((p) => p.id !== state.meId)
    .map((p) => ({ p, net: friendNet(state, state.meId, p.id) }))
    .sort((a, b) => Math.abs(b.net) - Math.abs(a.net));

  const owed = friends.reduce((s, f) => s + (f.net > 0 ? f.net : 0), 0);
  const owe = friends.reduce((s, f) => s + (f.net < 0 ? -f.net : 0), 0);

  return (
    <main className="safe-top flex flex-1 flex-col gap-5 px-5 pt-4">
      <h1 className="text-2xl font-black">Friends</h1>

      <AddFriendForm />

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
          <p className="mt-1 text-sm text-muted">Add one above to bring them onto Splitzy.</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {friends.map(({ p, net }) => {
            const settled = Math.abs(net) < 0.005;
            const owedYou = net > 0;
            const isOpen = open === p.id;
            // unfriending someone you still share a group with doesn't hide
            // them — they stay visible via the group, read-only
            const sharedGroups = state.groups.filter((g) => g.memberIds.includes(p.id));
            return (
              <li key={p.id} className="rounded-3xl border border-border bg-surface p-4 shadow-sm">
                <button
                  onClick={() => {
                    setOpen(isOpen ? null : p.id);
                    closeConfirm();
                  }}
                  className="flex w-full items-center gap-3 text-left"
                >
                  <Avatar person={p} size="md" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-extrabold">{p.name}</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {p.isPlaceholder ? (
                        <span className="text-[11px] font-semibold text-muted">👪 family member</span>
                      ) : p.tags.length ? (
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
                    {p.isPlaceholder ? (
                      <p className="text-xs font-semibold text-muted">
                        👪 A family member with no login of their own — added via the &quot;Family
                        trip&quot; option when creating a group.
                      </p>
                    ) : state.connectionIds.includes(p.id) ? (
                      <>
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
                      </>
                    ) : (
                      <>
                        <p className="mb-2 text-xs font-bold text-muted">
                          Shared with you through a group — add them as a friend to edit their profile
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {p.tags.length ? (
                            p.tags.map((t) => (
                              <span
                                key={t}
                                className="rounded-full bg-surface-2 px-3 py-1 text-xs font-bold text-muted"
                              >
                                {tagEmoji(t)} {tagLabel(t)}
                              </span>
                            ))
                          ) : (
                            <span className="text-xs font-semibold text-muted">no profile set</span>
                          )}
                        </div>
                      </>
                    )}

                    {/* Only a real connection can be removed — someone visible
                        purely through a shared group isn't on your list to drop. */}
                    {state.connectionIds.includes(p.id) &&
                      (confirming === p.id ? (
                        <div className="mt-3 flex flex-col gap-2 border-t border-border pt-3">
                          <p className="text-xs font-black">Remove {p.name}?</p>
                          {!settled && (
                            <p className="text-xs font-bold text-negative">
                              ⚠️{" "}
                              {owedYou
                                ? `${p.name} owes you ${money(Math.abs(net))}`
                                : `You owe ${p.name} ${money(Math.abs(net))}`}{" "}
                              — that balance stays in your shared groups.
                            </p>
                          )}
                          <p className="text-xs font-semibold text-muted">
                            {p.isPlaceholder
                              ? "They have no login of their own, so this deletes them permanently. Only possible while they aren't part of any expense."
                              : "Their account, your shared groups and all expense history stay exactly as they are."}
                          </p>
                          {!p.isPlaceholder && sharedGroups.length > 0 && (
                            <p className="text-xs font-semibold text-muted">
                              You still share {sharedGroups.length}{" "}
                              {sharedGroups.length === 1 ? "group" : "groups"} with them, so
                              they&apos;ll stay listed here — just without profile editing.
                            </p>
                          )}
                          {removeError && (
                            <p className="text-xs font-bold text-negative">{removeError}</p>
                          )}
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => doRemove(p.id)}
                              disabled={removing}
                              className="rounded-full bg-negative px-4 py-1.5 text-xs font-black text-white active:scale-95 disabled:opacity-50"
                            >
                              {removing ? "Removing…" : "Remove"}
                            </button>
                            <button
                              onClick={closeConfirm}
                              className="px-2 text-xs font-bold text-muted active:scale-95"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="mt-3 border-t border-border pt-3">
                          <button
                            onClick={() => {
                              setConfirming(p.id);
                              setRemoveError(null);
                            }}
                            className="text-xs font-bold text-negative active:scale-95"
                          >
                            {p.isPlaceholder ? "Remove family member" : "Remove friend"}
                          </button>
                        </div>
                      ))}
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
