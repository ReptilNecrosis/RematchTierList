import { AdminDashboard } from "../../components/admin-dashboard-staged";
import { AppShell } from "../../components/app-shell";
import { DataSourceBanner } from "../../components/data-source-banner";
import { getAdminDashboardData } from "../../lib/server/repository";
import { requireAdminPageSession } from "../../lib/server/services/auth";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const session = await requireAdminPageSession();
  const result = await getAdminDashboardData();
  return (
    <AppShell activePath="/admin" viewer={session.admin}>
      <DataSourceBanner message={result.warning} />
      <AdminDashboard
        previewSnapshot={result.data.previewSnapshot}
        stagedMoves={result.data.stagedMoves}
        pendingPlacements={result.data.pendingPlacements}
        publishValidationIssues={result.data.publishValidationIssues}
        tournaments={result.data.tournaments}
        viewer={session.admin}
      />
    </AppShell>
  );
}
