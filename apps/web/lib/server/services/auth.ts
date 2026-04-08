import type { AdminAccount } from "@rematch/shared-types";
import { redirect } from "next/navigation";

import { getServiceSupabase } from "../supabase";
import { createServerSupabaseAuthClient } from "../supabase-ssr";

const ADMIN_EMAIL_DOMAIN = "admins.rematch.local";

export interface AdminSession {
  admin: AdminAccount;
  authUserId: string;
  email: string;
}

interface AdminMutationResult {
  ok: boolean;
  message: string;
}

function normalizeUsername(username: string) {
  return username.trim().toLowerCase();
}

function normalizeDisplayName(displayName: string) {
  return displayName.trim();
}

function normalizePassword(password: string) {
  return password.trim();
}

function buildAdminAuthEmail(username: string) {
  return `${normalizeUsername(username)}@${ADMIN_EMAIL_DOMAIN}`;
}

function parseAdminAccount(row: Record<string, unknown>): AdminAccount {
  return {
    id: String(row.id),
    username: String(row.username),
    displayName: String(row.display_name),
    role: row.role === "super_admin" ? "super_admin" : "admin"
  };
}

async function fetchAdminByUsername(username: string) {
  const client = getServiceSupabase();
  if (!client) {
    throw new Error("Supabase service role is not configured.");
  }

  const { data, error } = await client
    .from("admin_accounts")
    .select("id, auth_user_id, username, display_name, role")
    .eq("username", normalizeUsername(username))
    .maybeSingle();

  if (error) {
    throw new Error(`Could not load admin account: ${error.message}`);
  }

  return data as Record<string, unknown> | null;
}

async function fetchAdminById(adminId: string) {
  const client = getServiceSupabase();
  if (!client) {
    throw new Error("Supabase service role is not configured.");
  }

  const { data, error } = await client
    .from("admin_accounts")
    .select("id, auth_user_id, username, display_name, role")
    .eq("id", adminId)
    .maybeSingle();

  if (error) {
    throw new Error(`Could not load admin account: ${error.message}`);
  }

  return data as Record<string, unknown> | null;
}

async function fetchAdminByAuthUserId(authUserId: string) {
  const client = getServiceSupabase();
  if (!client) {
    throw new Error("Supabase service role is not configured.");
  }

  const { data, error } = await client
    .from("admin_accounts")
    .select("id, auth_user_id, username, display_name, role")
    .eq("auth_user_id", authUserId)
    .maybeSingle();

  if (error) {
    throw new Error(`Could not load admin account: ${error.message}`);
  }

  return data as Record<string, unknown> | null;
}

async function getAdminCounts() {
  const client = getServiceSupabase();
  if (!client) {
    throw new Error("Supabase service role is not configured.");
  }

  const [adminsResult, superAdminsResult] = await Promise.all([
    client.from("admin_accounts").select("id", { count: "exact", head: true }),
    client.from("admin_accounts").select("id", { count: "exact", head: true }).eq("role", "super_admin")
  ]);

  if (adminsResult.error) {
    throw new Error(`Could not count admin accounts: ${adminsResult.error.message}`);
  }

  if (superAdminsResult.error) {
    throw new Error(`Could not count super admins: ${superAdminsResult.error.message}`);
  }

  return {
    adminCount: adminsResult.count ?? 0,
    superAdminCount: superAdminsResult.count ?? 0
  };
}

async function logAdminActivity(actorAdminId: string | null, verb: string, subject: string) {
  const client = getServiceSupabase();
  if (!client) {
    return;
  }

  await client.from("activity_log").insert({
    admin_account_id: actorAdminId,
    verb,
    subject
  } as never);
}

function validateAdminCredentials(username: string, password: string) {
  const normalizedUsername = normalizeUsername(username);
  const normalizedPassword = normalizePassword(password);

  if (!normalizedUsername) {
    return {
      ok: false,
      message: "Username is required."
    } satisfies AdminMutationResult;
  }

  if (!/^[a-z0-9._-]+$/.test(normalizedUsername)) {
    return {
      ok: false,
      message: "Username can only contain lowercase letters, numbers, dots, hyphens, and underscores."
    } satisfies AdminMutationResult;
  }

  if (normalizedPassword.length < 8) {
    return {
      ok: false,
      message: "Password must be at least 8 characters."
    } satisfies AdminMutationResult;
  }

  return {
    ok: true,
    username: normalizedUsername,
    password: normalizedPassword
  } as const;
}

export async function getBootstrapState() {
  const counts = await getAdminCounts();
  return {
    needsBootstrap: counts.adminCount === 0
  };
}

export async function getCurrentAdminSession(): Promise<AdminSession | null> {
  const client = getServiceSupabase();
  if (!client) {
    return null;
  }

  let authClient;
  try {
    authClient = await createServerSupabaseAuthClient();
  } catch {
    return null;
  }

  const {
    data: { user },
    error
  } = await authClient.auth.getUser();

  if (error || !user) {
    return null;
  }

  const adminRow = await fetchAdminByAuthUserId(user.id);
  if (!adminRow) {
    return null;
  }

  return {
    admin: parseAdminAccount(adminRow),
    authUserId: String(adminRow.auth_user_id),
    email: buildAdminAuthEmail(String(adminRow.username))
  };
}

export async function requireAdminPageSession(role?: "super_admin") {
  const session = await getCurrentAdminSession();
  if (!session) {
    redirect("/admin/login");
  }

  if (role && session.admin.role !== role) {
    redirect("/admin");
  }

  return session;
}

export async function loginAdmin(username: string, password: string) {
  const validation = validateAdminCredentials(username, password);
  if (!validation.ok) {
    return validation;
  }

  const adminRow = await fetchAdminByUsername(validation.username);
  if (!adminRow) {
    return {
      ok: false,
      message: "Unknown admin username."
    };
  }

  if (!adminRow.auth_user_id) {
    return {
      ok: false,
      message: "This admin account has not been linked to Supabase Auth yet. Ask a super admin to recreate or reset it."
    };
  }

  const authClient = await createServerSupabaseAuthClient();
  const { data, error } = await authClient.auth.signInWithPassword({
    email: buildAdminAuthEmail(validation.username),
    password: validation.password
  });

  if (error || !data.user) {
    return {
      ok: false,
      message: "Invalid username or password."
    };
  }

  return {
    ok: true,
    message: `Welcome back, ${String(adminRow.display_name)}.`,
    admin: parseAdminAccount(adminRow)
  };
}

export async function logoutAdmin() {
  const authClient = await createServerSupabaseAuthClient();
  const { error } = await authClient.auth.signOut();

  if (error) {
    return {
      ok: false,
      message: `Could not sign out cleanly: ${error.message}`
    };
  }

  return {
    ok: true,
    message: "Signed out."
  };
}

export async function bootstrapFirstAdmin(payload: {
  username: string;
  displayName: string;
  password: string;
}) {
  const validation = validateAdminCredentials(payload.username, payload.password);
  if (!validation.ok) {
    return validation;
  }

  const displayName = normalizeDisplayName(payload.displayName);
  if (!displayName) {
    return {
      ok: false,
      message: "Display name is required."
    };
  }

  const counts = await getAdminCounts();
  if (counts.adminCount > 0) {
    return {
      ok: false,
      message: "Bootstrap is only available before the first admin account exists."
    };
  }

  const client = getServiceSupabase();
  if (!client) {
    throw new Error("Supabase service role is not configured.");
  }

  const email = buildAdminAuthEmail(validation.username);
  const { data: createdUser, error: userError } = await client.auth.admin.createUser({
    email,
    password: validation.password,
    email_confirm: true,
    user_metadata: {
      username: validation.username,
      displayName,
      role: "super_admin"
    }
  });

  if (userError || !createdUser.user) {
    return {
      ok: false,
      message: userError?.message ?? "Could not create the first admin auth user."
    };
  }

  const { data: insertedAdmin, error: insertError } = await client
    .from("admin_accounts")
    .insert({
      auth_user_id: createdUser.user.id,
      username: validation.username,
      display_name: displayName,
      role: "super_admin"
    } as never)
    .select("id, auth_user_id, username, display_name, role")
    .single();

  if (insertError) {
    await client.auth.admin.deleteUser(createdUser.user.id).catch(() => undefined);
    return {
      ok: false,
      message: `Could not create the first admin account: ${insertError.message}`
    };
  }

  const authClient = await createServerSupabaseAuthClient();
  const { error: signInError } = await authClient.auth.signInWithPassword({
    email,
    password: validation.password
  });

  if (signInError) {
    return {
      ok: true,
      message: "First super admin created, but automatic sign-in failed. Try logging in with the credentials you just set.",
      admin: parseAdminAccount(insertedAdmin as Record<string, unknown>)
    };
  }

  return {
    ok: true,
    message: `Bootstrap complete. Welcome, ${displayName}.`,
    admin: parseAdminAccount(insertedAdmin as Record<string, unknown>)
  };
}

export async function createAdminAccount(
  actor: AdminSession,
  payload: {
    username: string;
    displayName: string;
    role: "super_admin" | "admin";
    password: string;
  }
) {
  if (actor.admin.role !== "super_admin") {
    return {
      ok: false,
      message: "Only super admins can create admin accounts."
    };
  }

  const validation = validateAdminCredentials(payload.username, payload.password);
  if (!validation.ok) {
    return validation;
  }

  const displayName = normalizeDisplayName(payload.displayName);
  if (!displayName) {
    return {
      ok: false,
      message: "Display name is required."
    };
  }

  const existingAdmin = await fetchAdminByUsername(validation.username);
  if (existingAdmin) {
    return {
      ok: false,
      message: "That username is already in use."
    };
  }

  const client = getServiceSupabase();
  if (!client) {
    throw new Error("Supabase service role is not configured.");
  }

  const email = buildAdminAuthEmail(validation.username);
  const { data: createdUser, error: createError } = await client.auth.admin.createUser({
    email,
    password: validation.password,
    email_confirm: true,
    user_metadata: {
      username: validation.username,
      displayName,
      role: payload.role
    }
  });

  if (createError || !createdUser.user) {
    return {
      ok: false,
      message: createError?.message ?? "Could not create the admin auth user."
    };
  }

  const { data: insertedAdmin, error: insertError } = await client
    .from("admin_accounts")
    .insert({
      auth_user_id: createdUser.user.id,
      username: validation.username,
      display_name: displayName,
      role: payload.role
    } as never)
    .select("id, auth_user_id, username, display_name, role")
    .single();

  if (insertError) {
    await client.auth.admin.deleteUser(createdUser.user.id).catch(() => undefined);
    return {
      ok: false,
      message: `Could not create the admin account: ${insertError.message}`
    };
  }

  return {
    ok: true,
    message: `${displayName} can now sign in with the username ${validation.username}.`,
    admin: parseAdminAccount(insertedAdmin as Record<string, unknown>)
  };
}

export async function resetAdminPassword(actor: AdminSession, payload: { adminId: string; password: string }) {
  if (actor.admin.role !== "super_admin") {
    return {
      ok: false,
      message: "Only super admins can reset admin passwords."
    };
  }

  const normalizedPassword = normalizePassword(payload.password);
  if (normalizedPassword.length < 8) {
    return {
      ok: false,
      message: "Password must be at least 8 characters."
    };
  }

  const targetAdmin = await fetchAdminById(payload.adminId);
  if (!targetAdmin || !targetAdmin.auth_user_id) {
    return {
      ok: false,
      message: "Admin account not found."
    };
  }

  const client = getServiceSupabase();
  if (!client) {
    throw new Error("Supabase service role is not configured.");
  }

  const { error } = await client.auth.admin.updateUserById(String(targetAdmin.auth_user_id), {
    password: normalizedPassword
  });

  if (error) {
    return {
      ok: false,
      message: `Could not reset the password: ${error.message}`
    };
  }

  return {
    ok: true,
    message: `Password reset for ${String(targetAdmin.display_name)}.`
  };
}

export async function deleteAdminAccount(actor: AdminSession, payload: { adminId: string }) {
  if (actor.admin.role !== "super_admin") {
    return {
      ok: false,
      message: "Only super admins can remove admin accounts."
    };
  }

  if (payload.adminId === actor.admin.id) {
    return {
      ok: false,
      message: "You cannot remove your own account."
    };
  }

  const targetAdmin = await fetchAdminById(payload.adminId);
  if (!targetAdmin) {
    return {
      ok: false,
      message: "Admin account not found."
    };
  }

  const counts = await getAdminCounts();
  if (String(targetAdmin.role) === "super_admin" && counts.superAdminCount <= 1) {
    return {
      ok: false,
      message: "You must keep at least one super admin account."
    };
  }

  const client = getServiceSupabase();
  if (!client) {
    throw new Error("Supabase service role is not configured.");
  }

  const { error: deleteAccountError } = await client.from("admin_accounts").delete().eq("id", payload.adminId);
  if (deleteAccountError) {
    return {
      ok: false,
      message: `Could not remove the admin account: ${deleteAccountError.message}`
    };
  }

  if (targetAdmin.auth_user_id) {
    const { error: deleteUserError } = await client.auth.admin.deleteUser(String(targetAdmin.auth_user_id));
    if (deleteUserError) {
      return {
        ok: false,
        message: `The admin row was removed, but the auth user could not be deleted: ${deleteUserError.message}`
      };
    }
  }

  return {
    ok: true,
    message: `${String(targetAdmin.display_name)} has been removed.`
  };
}
