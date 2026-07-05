"use server";

import { randomBytes } from "crypto";
import { createClient } from "@/lib/supabase/server";

export async function createInvite(groupId?: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const code = randomBytes(6).toString("base64url");
  const { error } = await supabase.from("invites").insert({
    code,
    created_by: user.id,
    group_id: groupId ?? null,
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  });
  if (error) throw new Error(error.message);

  return code;
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
  if (error) throw new Error(error.message);
  return data as InvitePreview | null;
}

export async function acceptInvite(code: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase.rpc("accept_invite", { p_code: code });
  if (error) throw new Error(error.message);
  return data as { group_id: string | null; inviter_id: string };
}
