import { redirect } from "next/navigation";

import { AppShell } from "../../../components/app-shell";
import { LoginCard } from "../../../components/login-card";
import { getBootstrapState, getCurrentAdminSession } from "../../../lib/server/services/auth";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const [session, bootstrapState] = await Promise.all([getCurrentAdminSession(), getBootstrapState()]);
  if (session) {
    redirect("/admin");
  }

  return (
    <AppShell activePath="/admin/login" viewer={null}>
      <LoginCard needsBootstrap={bootstrapState.needsBootstrap} />
    </AppShell>
  );
}
