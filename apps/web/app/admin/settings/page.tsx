import { AppShell } from "../../../components/app-shell";
import { DataSourceBanner } from "../../../components/data-source-banner";
import { SettingsScreen } from "../../../components/settings-screen";
import { getSettingsData } from "../../../lib/server/repository";
import { requireAdminPageSession } from "../../../lib/server/services/auth";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await requireAdminPageSession();
  const result = await getSettingsData();
  return (
    <AppShell activePath="/admin/settings" viewer={session.admin}>
      <DataSourceBanner message={result.warning} />
      <SettingsScreen settings={result.data.settings} admins={result.data.admins} viewer={session.admin} />
    </AppShell>
  );
}
