"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/Button";
import { requestOtp, verifyOtp } from "./actions";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const redirectTo = params.get("redirect") || "/";

  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendCode = async () => {
    const e = email.trim();
    if (!e) return;
    setPending(true);
    setError(null);
    try {
      await requestOtp(e);
      setStep("code");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setPending(false);
    }
  };

  const confirmCode = async () => {
    if (code.trim().length < 6) return;
    setPending(true);
    setError(null);
    try {
      await verifyOtp(email.trim(), code.trim());
      router.push(redirectTo);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid code");
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

      {step === "email" ? (
        <div className="flex w-full max-w-xs flex-col gap-3">
          <input
            autoFocus
            type="email"
            inputMode="email"
            placeholder="you@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendCode()}
            className="w-full rounded-3xl border border-border bg-surface px-5 py-4 text-center font-bold outline-none placeholder:font-semibold placeholder:text-muted focus:border-primary"
          />
          <Button onClick={sendCode} disabled={pending || !email.trim()} size="lg" fullWidth>
            {pending ? "Sending…" : "Send me a code"}
          </Button>
        </div>
      ) : (
        <div className="flex w-full max-w-xs flex-col gap-3">
          <p className="text-sm font-semibold text-muted">
            Enter the 6-digit code sent to{" "}
            <span className="font-bold text-foreground">{email}</span>
          </p>
          <input
            autoFocus
            inputMode="numeric"
            placeholder="123456"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            onKeyDown={(e) => e.key === "Enter" && confirmCode()}
            className="w-full rounded-3xl border border-border bg-surface px-5 py-4 text-center text-2xl font-black tracking-[0.3em] outline-none placeholder:text-border focus:border-primary"
          />
          <Button onClick={confirmCode} disabled={pending || code.length < 6} size="lg" fullWidth>
            {pending ? "Checking…" : "Continue"}
          </Button>
          <button
            onClick={() => {
              setStep("email");
              setCode("");
              setError(null);
            }}
            className="text-sm font-bold text-muted active:scale-95"
          >
            Use a different email
          </button>
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
