"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/Button";
import { requestOtp } from "./actions";

function LoginForm() {
  const params = useSearchParams();
  const redirectTo = params.get("redirect") || "/";
  const linkFailed = params.get("error") === "invalid-link";

  const [sent, setSent] = useState(false);
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendLink = async () => {
    const e = email.trim();
    if (!e) return;
    setPending(true);
    setError(null);
    try {
      const confirmUrl = `${window.location.origin}/auth/confirm?next=${encodeURIComponent(redirectTo)}`;
      await requestOtp(e, confirmUrl);
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setPending(false);
    }
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

      {sent ? (
        <div className="flex w-full max-w-xs flex-col gap-2">
          <p className="text-4xl">📬</p>
          <p className="font-bold">Check your email</p>
          <p className="text-sm font-semibold text-muted">
            We sent a sign-in link to <span className="text-foreground">{email}</span> — open
            it on this device to continue.
          </p>
          <button
            onClick={() => setSent(false)}
            className="mt-2 text-sm font-bold text-muted active:scale-95"
          >
            Use a different email
          </button>
        </div>
      ) : (
        <div className="flex w-full max-w-xs flex-col gap-3">
          {linkFailed && (
            <p className="text-sm font-bold text-negative">
              That link expired or was already used — send a new one.
            </p>
          )}
          <input
            autoFocus
            type="email"
            inputMode="email"
            placeholder="you@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendLink()}
            className="w-full rounded-3xl border border-border bg-surface px-5 py-4 text-center font-bold outline-none placeholder:font-semibold placeholder:text-muted focus:border-primary"
          />
          <Button onClick={sendLink} disabled={pending || !email.trim()} size="lg" fullWidth>
            {pending ? "Sending…" : "Send me a sign-in link"}
          </Button>
        </div>
      )}

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
