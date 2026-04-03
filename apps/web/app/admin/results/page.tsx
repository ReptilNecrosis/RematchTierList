import { AppShell } from "../../../components/app-shell";
import { ResultLoggingPage } from "../../../components/result-logging-page";
import { getImportPreviewRows, getScreenshotPreviewRows } from "../../../lib/sample-data/demo";
import { getImportReferenceData } from "../../../lib/server/repository";
import { requireAdminPageSession } from "../../../lib/server/services/auth";

export const dynamic = "force-dynamic";

export default async function ResultsPage() {
  const session = await requireAdminPageSession();
  const referenceData = await getImportReferenceData();
  return (
    <AppShell activePath="/admin/results" viewer={session.admin}>
      <ResultLoggingPage
        initialRows={getImportPreviewRows()}
        initialMessage="Adapter preview loaded from shared normalization contracts."
        initialScreenshotRows={getScreenshotPreviewRows()}
        availableTeams={referenceData.teams.map((team) => ({
          id: team.id,
          name: team.name,
          shortCode: team.shortCode,
          tierId: team.tierId,
          verified: team.verified
        }))}
      />
    </AppShell>
  );
}
