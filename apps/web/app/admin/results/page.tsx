import { AppShell } from "../../../components/app-shell";
import { ResultLoggingPage } from "../../../components/result-logging-page";
import { getImportPreviewRows, getScreenshotPreviewRows } from "../../../lib/sample-data/demo";
import { requireAdminPageSession } from "../../../lib/server/services/auth";

export const dynamic = "force-dynamic";

export default async function ResultsPage() {
  const session = await requireAdminPageSession();
  return (
    <AppShell activePath="/admin/results" viewer={session.admin}>
      <ResultLoggingPage
        initialRows={getImportPreviewRows()}
        initialMessage="Adapter preview loaded from shared normalization contracts."
        initialScreenshotRows={getScreenshotPreviewRows()}
      />
    </AppShell>
  );
}
