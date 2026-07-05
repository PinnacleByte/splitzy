"use server";

import { createClient } from "@/lib/supabase/server";

export async function requestOtp(email: string, redirectTo: string) {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true, emailRedirectTo: redirectTo },
  });
  if (error) throw new Error(error.message);
}
