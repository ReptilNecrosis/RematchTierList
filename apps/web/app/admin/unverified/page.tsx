import { AppShell } from "../../../components/app-shell";
import { UnverifiedTeamsScreen } from "../../../components/unverified-teams-screen";
import { currentSnapshot } from "../../../lib/sample-data/demo";
import { requireAdminPageSession } from "../../../lib/server/services/auth";

export const dynamic = "force-dynamic";

export default async function UnverifiedPage() {
  const session = await requireAdminPageSession();
  return (
    <AppShell activePath="/admin/unverified" viewer={session.admin}>
      <UnverifiedTeamsScreen snapshot={currentSnapshot} />
    </AppShell>
  );
}
