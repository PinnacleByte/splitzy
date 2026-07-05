"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/Button";
import { createClient } from "@/lib/supabase/client";
import { acceptInvite } from "@/lib/invites";

export function AcceptInviteButton({ code }: { code: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onClick = async () => {
    setPending(true);
    setError(null);

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.push(`/login?redirect=${encodeURIComponent(`/invite/${code}`)}`);
      return;
    }

    const result = await acceptInvite(code);
    if (result.error || !result.data) {
      setError(result.error ?? "Something went wrong");
      setPending(false);
      return;
    }
    router.push(result.data.group_id ? `/groups/${result.data.group_id}` : "/friends");
    router.refresh();
  };

  return (
    <div className="flex w-full max-w-xs flex-col gap-2">
      <Button onClick={onClick} disabled={pending} size="lg" fullWidth>
        {pending ? "Joining…" : "Join Splitzy"}
      </Button>
      {error && <p className="text-sm font-bold text-negative">{error}</p>}
    </div>
  );
}
