import { notFound } from "next/navigation";

import { AppShell } from "../../../../components/app-shell";
import { DataSourceBanner } from "../../../../components/data-source-banner";
import { TeamProfileScreen } from "../../../../components/team-profile-screen";
import { getTeamPageData } from "../../../../lib/server/repository";
import { requireAdminPageSession } from "../../../../lib/server/services/auth";

export const dynamic = "force-dynamic";

export default async function AdminTeamPage({
  params,
  searchParams
}: {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ month?: string }>;
}) {
  const session = await requireAdminPageSession();
  const { slug } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const result = await getTeamPageData(slug, resolvedSearchParams?.month);
  const team = result.data.team;

  if (!team) {
    notFound();
  }

  return (
    <AppShell activePath="/admin" viewer={session.admin}>
      <DataSourceBanner message={result.warning} />
      <TeamProfileScreen
        team={team}
        snapshot={result.data.snapshot}
        history={result.data.history}
        recentSeries={result.data.recentSeries}
        seasonRecords={result.data.seasonRecords}
        allTimeRecord={result.data.allTimeRecord}
        currentSeasonKey={result.data.currentSeasonKey}
        currentSeasonLabel={result.data.currentSeasonLabel}
        selectedSeasonKey={result.data.selectedSeasonKey}
        selectedSeasonLabel={result.data.selectedSeasonLabel}
        selectedSeasonSeries={result.data.selectedSeasonSeries}
        stagedMove={result.data.stagedMove}
        viewer={session.admin}
      />
    </AppShell>
  );
}
