"use client";

import { useState } from "react";
import { Button } from "@/components/Button";
import { addFriendAccount } from "@/lib/accountActions";

export function AddFriendForm({
  groupId,
  label = "Add a friend",
  className = "",
}: {
  /** set to add the new friend straight into this group */
  groupId?: string;
  label?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // revealed only when the email has no account yet and a temp password is
  // needed to create one (status: "needs_password" from addFriendAccount).
  const [needsPassword, setNeedsPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // null while editing; "connected" | "created" once done, to pick the message.
  const [done, setDone] = useState<"connected" | "created" | null>(null);

  const reset = () => {
    setOpen(false);
    setDone(null);
    setNeedsPassword(false);
    setName("");
    setEmail("");
    setPassword("");
    setError(null);
  };

  const submit = async () => {
    if (!name.trim() || !email.trim()) return;
    if (needsPassword && password.length < 6) return;
    setPending(true);
    setError(null);
    const result = await addFriendAccount({
      name: name.trim(),
      email: email.trim(),
      password: password || undefined,
      groupId,
    });
    setPending(false);
    if (result.error) {
      setError(result.error);
    } else if (result.status === "needs_password") {
      // email isn't registered yet — ask for a temp password, then resubmit.
      setNeedsPassword(true);
    } else if (result.status === "connected" || result.status === "created") {
      setDone(result.status);
    }
  };

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} variant="soft" fullWidth className={className}>
        👤➕ {label}
      </Button>
    );
  }

  if (done) {
    return (
      <div className={`rounded-2xl bg-surface-2 p-3 ${className}`}>
        <p className="text-sm font-bold">
          {done === "connected"
            ? `You're now connected with ${email}.`
            : `${name} can sign in with ${email} and the password you set.`}
        </p>
        <button onClick={reset} className="mt-2 text-xs font-bold text-primary active:scale-95">
          Done
        </button>
      </div>
    );
  }

  return (
    <div className={`flex flex-col gap-2 rounded-2xl border border-dashed border-border bg-surface/50 p-3 ${className}`}>
      <input
        placeholder="Their name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="rounded-full bg-surface-2 px-4 py-2 text-sm font-bold outline-none placeholder:font-semibold placeholder:text-muted"
      />
      <input
        type="email"
        placeholder="Their email"
        value={email}
        onChange={(e) => {
          setEmail(e.target.value);
          // editing the email invalidates a prior "needs password" verdict.
          if (needsPassword) setNeedsPassword(false);
        }}
        className="rounded-full bg-surface-2 px-4 py-2 text-sm font-bold outline-none placeholder:font-semibold placeholder:text-muted"
      />
      {needsPassword && (
        <>
          <p className="px-1 text-xs font-semibold text-muted">
            They haven&apos;t joined yet — set a temporary password to create their account.
          </p>
          <input
            type="text"
            placeholder="Temp password (min 6 chars)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
            className="rounded-full bg-surface-2 px-4 py-2 text-sm font-bold outline-none placeholder:font-semibold placeholder:text-muted"
          />
        </>
      )}
      {error && <p className="text-xs font-bold text-negative">{error}</p>}
      <div className="flex items-center gap-2">
        <Button
          onClick={submit}
          disabled={
            pending ||
            !name.trim() ||
            !email.trim() ||
            (needsPassword && password.length < 6)
          }
          variant="soft"
          className="flex-1"
        >
          {pending ? (needsPassword ? "Creating…" : "Adding…") : needsPassword ? "Create account" : "Add friend"}
        </Button>
        <button onClick={reset} className="px-3 text-xs font-bold text-muted active:scale-95">
          Cancel
        </button>
      </div>
    </div>
  );
}
