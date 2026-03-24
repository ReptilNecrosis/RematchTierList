import { AdminDashboard } from "../../components/admin-dashboard";
import { AppShell } from "../../components/app-shell";
import { DataSourceBanner } from "../../components/data-source-banner";
import { getDashboardData } from "../../lib/server/repository";
import { requireAdminPageSession } from "../../lib/server/services/auth";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const session = await requireAdminPageSession();
  const result = await getDashboardData();
  return (
    <AppShell activePath="/admin" viewer={session.admin}>
      <DataSourceBanner message={result.warning} />
      <AdminDashboard snapshot={result.data.snapshot} tournaments={result.data.tournaments} viewer={session.admin} />
    </AppShell>
  );
}
