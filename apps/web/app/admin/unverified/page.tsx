import { AppShell } from "../../../components/app-shell";
import { DataSourceBanner } from "../../../components/data-source-banner";
import { UnverifiedTeamsWorkflowScreen } from "../../../components/unverified-teams-workflow-screen";
import { getDashboardData } from "../../../lib/server/repository";
import { getCurrentAdminSession } from "../../../lib/server/services/auth";

export const dynamic = "force-dynamic";

export default async function UnverifiedPage() {
  const session = await getCurrentAdminSession();
  const result = await getDashboardData();
  return (
    <AppShell activePath="/admin/unverified" viewer={session?.admin ?? null}>
      <DataSourceBanner message={result.warning} />
      <UnverifiedTeamsWorkflowScreen snapshot={result.data.snapshot} canEdit={!!session} />
    </AppShell>
  );
}
