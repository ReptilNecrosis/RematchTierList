import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { getServerEnv } from "./env";

export async function createServerSupabaseAuthClient() {
  const env = getServerEnv();
  if (!env.supabaseUrl || !env.supabaseAnonKey) {
    throw new Error("Supabase auth environment variables are not configured.");
  }

  const cookieStore = await cookies();

  return createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(
        cookiesToSet: Array<{
          name: string;
          value: string;
          options?: Parameters<typeof cookieStore.set>[2];
        }>
      ) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server components may not allow cookie writes. Route handlers do.
        }
      }
    }
  });
}
