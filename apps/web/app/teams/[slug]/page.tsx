import { notFound } from "next/navigation";

import { AppShell } from "../../../components/app-shell";
import { DataSourceBanner } from "../../../components/data-source-banner";
import { TeamProfileScreen } from "../../../components/team-profile-screen-enhanced";
import { getTeamPageData } from "../../../lib/server/repository";
import { getCurrentAdminSession } from "../../../lib/server/services/auth";

export const dynamic = "force-dynamic";

export default async function TeamPage({
  params,
  searchParams
}: {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ month?: string; view?: string }>;
}) {
  const { slug } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const [result, session] = await Promise.all([
    getTeamPageData(slug, resolvedSearchParams?.month),
    getCurrentAdminSession()
  ]);
  const team = result.data.team;
  if (!team) {
    notFound();
  }

  return (
    <AppShell activePath={`/teams/${slug}`} viewer={session?.admin ?? null}>
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
        tierBreakdown={result.data.tierBreakdown}
        allTimeTierBreakdown={result.data.allTimeTierBreakdown}
        stagedMove={result.data.stagedMove}
        viewer={session?.admin ?? null}
        allSeries={result.data.allSeries}
        allTeams={result.data.allTeams}
      />
    </AppShell>
  );
}
