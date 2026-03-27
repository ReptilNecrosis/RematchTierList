import { AppShell } from "../../components/app-shell";
import { DataSourceBanner } from "../../components/data-source-banner";
import { HistoryScreen } from "../../components/history-screen";
import { getHistoryPageData } from "../../lib/server/repository";
import { getCurrentAdminSession } from "../../lib/server/services/auth";

export const dynamic = "force-dynamic";

export default async function HistoryPage({
  searchParams
}: {
  searchParams?: Promise<{ month?: string }>;
}) {
  const session = await getCurrentAdminSession();
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const result = await getHistoryPageData(resolvedSearchParams?.month);

  return (
    <AppShell activePath="/history" viewer={session?.admin ?? null}>
      <DataSourceBanner message={result.warning} />
      <HistoryScreen data={result.data} teamHrefBase={session ? "/admin/teams" : "/teams"} />
    </AppShell>
  );
}
