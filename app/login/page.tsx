"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/Button";
import { useStore } from "@/lib/store";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const redirectTo = params.get("redirect") || "/";
  const { signIn, signUp } = useStore();

  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSignup = mode === "signup";
  const canSubmit =
    email.trim().length > 0 && password.length > 0 && (!isSignup || name.trim().length > 0);

  const submit = async () => {
    if (!canSubmit) return;
    setPending(true);
    setError(null);
    const result = isSignup
      ? await signUp(name.trim(), email.trim(), password)
      : await signIn(email.trim(), password);
    if (result.error) {
      setError(result.error);
      setPending(false);
      return;
    }
    router.push(redirectTo);
  };

  const switchMode = (next: "signin" | "signup") => {
    setMode(next);
    setError(null);
  };

  return (
    <main className="safe-top flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
      <div className="text-6xl">🧾</div>
      <div>
        <h1 className="text-2xl font-black">Splitzy</h1>
        <p className="mt-1 text-sm font-semibold text-muted">
          Split bills with friends, for real this time.
        </p>
      </div>

      <div className="flex w-full max-w-xs flex-col gap-3">
        <div className="grid grid-cols-2 gap-1 rounded-full bg-surface-2 p-1">
          {(
            [
              ["signin", "Sign in"],
              ["signup", "Create account"],
            ] as const
          ).map(([val, label]) => (
            <button
              key={val}
              onClick={() => switchMode(val)}
              className={`rounded-full py-2 text-sm font-bold transition-all ${
                mode === val ? "bg-surface text-foreground shadow-sm" : "text-muted"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {isSignup && (
          <input
            type="text"
            placeholder="Your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            className="w-full rounded-3xl border border-border bg-surface px-5 py-4 text-center font-bold outline-none placeholder:font-semibold placeholder:text-muted focus:border-primary"
          />
        )}
        <input
          autoFocus
          type="email"
          inputMode="email"
          placeholder="you@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          className="w-full rounded-3xl border border-border bg-surface px-5 py-4 text-center font-bold outline-none placeholder:font-semibold placeholder:text-muted focus:border-primary"
        />
        <input
          type="password"
          placeholder={isSignup ? "Choose a password" : "Password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          className="w-full rounded-3xl border border-border bg-surface px-5 py-4 text-center font-bold outline-none placeholder:font-semibold placeholder:text-muted focus:border-primary"
        />
        <Button onClick={submit} disabled={pending || !canSubmit} size="lg" fullWidth>
          {pending
            ? isSignup
              ? "Creating account…"
              : "Signing in…"
            : isSignup
              ? "Create account"
              : "Sign in"}
        </Button>
        <p className="text-xs font-semibold text-muted">
          {isSignup
            ? "Creating a fresh space just for you and the friends you add."
            : "New here? Tap Create account to start your own group."}
        </p>
      </div>

      {error && <p className="text-sm font-bold text-negative">{error}</p>}
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
