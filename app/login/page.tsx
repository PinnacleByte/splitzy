"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/Button";
import { useStore } from "@/lib/store";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const redirectTo = params.get("redirect") || "/";
  const { signIn } = useStore();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!email.trim() || !password) return;
    setPending(true);
    setError(null);
    const result = await signIn(email.trim(), password);
    if (result.error) {
      setError(result.error);
      setPending(false);
      return;
    }
    router.push(redirectTo);
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
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          className="w-full rounded-3xl border border-border bg-surface px-5 py-4 text-center font-bold outline-none placeholder:font-semibold placeholder:text-muted focus:border-primary"
        />
        <Button onClick={submit} disabled={pending || !email.trim() || !password} size="lg" fullWidth>
          {pending ? "Signing in…" : "Sign in"}
        </Button>
        <p className="text-xs font-semibold text-muted">
          Don&apos;t have an account? Ask whoever invited you to Splitzy to add you.
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
