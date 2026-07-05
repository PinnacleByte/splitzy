"use client";

import { useState } from "react";
import { Button } from "@/components/Button";
import { createInvite } from "@/lib/invites";

export function InviteButton({
  groupId,
  label = "Invite a friend",
  className = "",
}: {
  /** set to add the invitee straight into this group once they accept */
  groupId?: string;
  label?: string;
  className?: string;
}) {
  const [pending, setPending] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const invite = async () => {
    setPending(true);
    setLink(null);
    try {
      const code = await createInvite(groupId);
      const url = `${window.location.origin}/invite/${code}`;
      if (navigator.share) {
        await navigator.share({
          title: "Join me on Splitzy",
          text: "Split bills with me on Splitzy",
          url,
        });
      } else {
        setLink(url);
      }
    } catch {
      // share sheet was dismissed, or invite creation failed — nothing to do
    } finally {
      setPending(false);
    }
  };

  const copy = async () => {
    if (!link) return;
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className={className}>
      <Button onClick={invite} variant="soft" disabled={pending} fullWidth>
        {pending ? "Creating link…" : `✉️ ${label}`}
      </Button>
      {link && (
        <div className="mt-2 flex items-center gap-2 rounded-2xl bg-surface-2 p-2 pl-3">
          <span className="flex-1 truncate text-xs font-semibold text-muted">{link}</span>
          <button
            onClick={copy}
            className="shrink-0 rounded-full bg-primary-soft px-3 py-1.5 text-xs font-bold text-primary active:scale-95"
          >
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
      )}
    </div>
  );
}
