import { AppShell } from "../../components/app-shell";
import { DataSourceBanner } from "../../components/data-source-banner";
import { HistoryScreen } from "../../components/history-screen";
import { getHistoryPageData } from "../../lib/server/repository";

export const dynamic = "force-dynamic";

export default async function HistoryPage({
  searchParams
}: {
  searchParams?: Promise<{ month?: string }>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const result = await getHistoryPageData(resolvedSearchParams?.month);

  return (
    <AppShell activePath="/history" viewer={null}>
      <DataSourceBanner message={result.warning} />
      <HistoryScreen data={result.data} />
    </AppShell>
  );
}
