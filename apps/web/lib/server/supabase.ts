import { createClient } from "@supabase/supabase-js";

import { getServerEnv } from "./env";

let serviceClient:
  | ReturnType<typeof createClient>
  | null = null;

export function getServiceSupabase() {
  if (serviceClient) {
    return serviceClient;
  }

  const env = getServerEnv();
  if (!env.supabaseUrl || !env.supabaseServiceRoleKey) {
    return null;
  }

  serviceClient = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });

  return serviceClient;
}

export function getStorageClient() {
  const client = getServiceSupabase();
  if (!client) {
    return null;
  }
  return client.storage;
}

export async function canQuerySupabase() {
  const client = getServiceSupabase();
  if (!client) {
    return {
      ok: false,
      reason: "Missing Supabase environment variables."
    };
  }

  const { error } = await client.from("teams").select("id").limit(1);
  if (error) {
    return {
      ok: false,
      reason: error.message
    };
  }

  return {
    ok: true,
    reason: "Connected"
  };
}
