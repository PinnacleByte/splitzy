"use client";

import { useState } from "react";
import { Button } from "@/components/Button";
import { addFriendAccount } from "@/lib/adminActions";

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
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const reset = () => {
    setOpen(false);
    setDone(false);
    setName("");
    setEmail("");
    setPassword("");
    setError(null);
  };

  const submit = async () => {
    if (!name.trim() || !email.trim() || password.length < 6) return;
    setPending(true);
    setError(null);
    const result = await addFriendAccount({
      name: name.trim(),
      email: email.trim(),
      password,
      groupId,
    });
    setPending(false);
    if (result.error) setError(result.error);
    else setDone(true);
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
          {name} can sign in with {email} and the password you set.
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
        onChange={(e) => setEmail(e.target.value)}
        className="rounded-full bg-surface-2 px-4 py-2 text-sm font-bold outline-none placeholder:font-semibold placeholder:text-muted"
      />
      <input
        type="text"
        placeholder="Temp password (min 6 chars)"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="rounded-full bg-surface-2 px-4 py-2 text-sm font-bold outline-none placeholder:font-semibold placeholder:text-muted"
      />
      {error && <p className="text-xs font-bold text-negative">{error}</p>}
      <div className="flex items-center gap-2">
        <Button
          onClick={submit}
          disabled={pending || !name.trim() || !email.trim() || password.length < 6}
          variant="soft"
          className="flex-1"
        >
          {pending ? "Creating…" : "Create account"}
        </Button>
        <button onClick={reset} className="px-3 text-xs font-bold text-muted active:scale-95">
          Cancel
        </button>
      </div>
    </div>
  );
}
