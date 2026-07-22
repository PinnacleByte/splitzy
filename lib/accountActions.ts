"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Open self-serve signup. Creates a brand-new account via the Supabase admin
 * API (email_confirm: true → no confirmation email, so no rate-limited email
 * sender is ever involved). The account starts with NO connections — a fresh
 * signup bootstraps its own isolated circle. The profiles row is auto-created
 * by the handle_new_user trigger (supabase/schema.sql).
 */
export async function signUpAccount(data: {
  name: string;
  email: string;
  password: string;
}): Promise<{ error: string | null }> {
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.createUser({
    email: data.email,
    password: data.password,
    email_confirm: true,
    user_metadata: { name: data.name },
  });
  return { error: error?.message ?? null };
}

/**
 * Add a friend by creating their account and connecting to them. Available to
 * any signed-in user — each user builds their own circle. The symmetric
 * connections rows are written between the caller and the new user, so circles
 * stay isolated (there is no global admin hub). Uses the admin API for the same
 * no-email reason as signUpAccount.
 */
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

  if (!user) {
    return { error: "You must be signed in to add a friend." };
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

// mirrors handle_new_user()'s palette (supabase/schema.sql) for visual consistency
const PLACEHOLDER_PALETTE = [
  "from-sky-400 to-cyan-400",
  "from-amber-400 to-orange-400",
  "from-rose-400 to-pink-400",
  "from-emerald-400 to-teal-400",
  "from-indigo-400 to-violet-400",
  "from-fuchsia-400 to-pink-500",
];

/**
 * Create a "placeholder" person — a family member with no login of their own
 * (e.g. the rest of a family trip's household, whose one "lead" account
 * manages them). No email/password: this writes a bare profiles row with no
 * corresponding auth.users row (is_placeholder = true, owner_id = you), which
 * is why it needs the admin/service-role client the same way signUpAccount
 * and addFriendAccount do. Also connects you to them symmetrically, same as
 * addFriendAccount, so they show up as an ordinary entry in your Friends list
 * and can be reused across future trips instead of re-typing their name.
 */
export async function createPlaceholderPerson(data: {
  name: string;
  groupId?: string;
}): Promise<{ id: string | null; error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { id: null, error: "You must be signed in to add a family member." };
  }

  const admin = createAdminClient();
  const id = crypto.randomUUID();
  const color = PLACEHOLDER_PALETTE[Math.floor(Math.random() * PLACEHOLDER_PALETTE.length)];

  const { error: profileError } = await admin.from("profiles").insert({
    id,
    name: data.name,
    color,
    is_placeholder: true,
    owner_id: user.id,
  });
  if (profileError) return { id: null, error: profileError.message };

  const { error: connError } = await admin.from("connections").insert([
    { user_id: user.id, friend_id: id },
    { user_id: id, friend_id: user.id },
  ]);
  if (connError) return { id: null, error: connError.message };

  if (data.groupId) {
    const { error: memberError } = await admin
      .from("group_members")
      .insert({ group_id: data.groupId, person_id: id });
    if (memberError) return { id: null, error: memberError.message };
  }

  return { id, error: null };
}
