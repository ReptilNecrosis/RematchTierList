import { AppShell } from "../../../components/app-shell";
import { DataSourceBanner } from "../../../components/data-source-banner";
import { UnverifiedTeamsWorkflowScreen } from "../../../components/unverified-teams-workflow-screen";
import { getDashboardData } from "../../../lib/server/repository";
import { requireAdminPageSession } from "../../../lib/server/services/auth";

export const dynamic = "force-dynamic";

export default async function UnverifiedPage() {
  const session = await requireAdminPageSession();
  const result = await getDashboardData();
  return (
    <AppShell activePath="/admin/unverified" viewer={session.admin}>
      <DataSourceBanner message={result.warning} />
      <UnverifiedTeamsWorkflowScreen snapshot={result.data.snapshot} />
    </AppShell>
  );
}
