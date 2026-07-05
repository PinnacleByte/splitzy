"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function addFriendAccount(data: {
  name: string;
  email: string;
  password: string;
  groupId?: string;
}): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || user.email !== process.env.NEXT_PUBLIC_ADMIN_EMAIL) {
    return { error: "Only the admin account can add friends this way." };
  }

  const admin = createAdminClient();
  const { data: created, error } = await admin.auth.admin.createUser({
    email: data.email,
    password: data.password,
    email_confirm: true,
    user_metadata: { name: data.name },
  });
  if (error) return { error: error.message };

  const newId = created.user.id;

  const { error: connError } = await admin.from("connections").insert([
    { user_id: user.id, friend_id: newId },
    { user_id: newId, friend_id: user.id },
  ]);
  if (connError) return { error: connError.message };

  if (data.groupId) {
    const { error: memberError } = await admin
      .from("group_members")
      .insert({ group_id: data.groupId, person_id: newId });
    if (memberError) return { error: memberError.message };
  }

  return { error: null };
}
