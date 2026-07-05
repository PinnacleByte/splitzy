"use server";

import { createClient } from "@/lib/supabase/server";

export async function requestOtp(email: string, redirectTo: string) {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true, emailRedirectTo: redirectTo },
  });
  // Return errors as data rather than throwing — Next.js redacts thrown
  // Server Action errors to a generic message in production builds, which
  // would hide useful signals like Supabase's rate-limit responses.
  return { error: error?.message ?? null };
}
