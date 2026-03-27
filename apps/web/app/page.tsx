import { AppShell } from "../components/app-shell";
import { DataSourceBanner } from "../components/data-source-banner";
import { PublicTierList } from "../components/public-tier-list";
import { latestTierUpdateLabel } from "../lib/sample-data/demo";
import { getDashboardData } from "../lib/server/repository";
import { getCurrentAdminSession } from "../lib/server/services/auth";

export const dynamic = "force-dynamic";

export default async function HomePage({
  searchParams
}: {
  searchParams?: Promise<{ teamDeleted?: string }>;
}) {
  const session = await getCurrentAdminSession();
  const result = await getDashboardData();
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const statusMessage = resolvedSearchParams?.teamDeleted
    ? `${resolvedSearchParams.teamDeleted} was deleted.`
    : null;

  return (
    <AppShell activePath="/" viewer={session?.admin ?? null}>
      <DataSourceBanner message={result.warning} />
      <PublicTierList
        snapshot={result.data.snapshot}
        lastUpdatedLabel={latestTierUpdateLabel}
        teamHrefBase={session ? "/admin/teams" : "/teams"}
        statusMessage={statusMessage}
      />
    </AppShell>
  );
}
