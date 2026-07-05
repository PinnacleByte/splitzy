"use server";

import { randomBytes } from "crypto";
import { createClient } from "@/lib/supabase/server";

// These return errors as data rather than throwing — Next.js redacts thrown
// Server Action errors to a generic message in production builds, which
// would hide useful signals (auth/rate-limit/RLS messages) from the UI.

export async function createInvite(groupId?: string): Promise<{ code: string | null; error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { code: null, error: "Not authenticated" };

  const code = randomBytes(6).toString("base64url");
  const { error } = await supabase.from("invites").insert({
    code,
    created_by: user.id,
    group_id: groupId ?? null,
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  });
  if (error) return { code: null, error: error.message };

  return { code, error: null };
}

export type InvitePreview = {
  inviter_name: string;
  inviter_color: string;
  group_name: string | null;
  group_emoji: string | null;
  expired: boolean;
  accepted: boolean;
};

export async function getInvitePreview(code: string): Promise<InvitePreview | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("get_invite_preview", { p_code: code })
    .maybeSingle();
  if (error) {
    console.error("getInvitePreview failed:", error.message);
    return null;
  }
  return data as InvitePreview | null;
}

export async function acceptInvite(
  code: string,
): Promise<{ data: { group_id: string | null; inviter_id: string } | null; error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  const { data, error } = await supabase.rpc("accept_invite", { p_code: code });
  if (error) return { data: null, error: error.message };
  return { data: data as { group_id: string | null; inviter_id: string }, error: null };
}
