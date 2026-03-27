import { notFound } from "next/navigation";

import { AppShell } from "../../../components/app-shell";
import { DataSourceBanner } from "../../../components/data-source-banner";
import { TeamProfileScreen } from "../../../components/team-profile-screen";
import { getTeamPageData } from "../../../lib/server/repository";

export default async function TeamPage({
  params,
  searchParams
}: {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ month?: string; view?: string }>;
}) {
  const { slug } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const result = await getTeamPageData(slug, resolvedSearchParams?.month);
  const team = result.data.team;
  if (!team) {
    notFound();
  }

  return (
    <AppShell activePath={`/teams/${slug}`} viewer={null}>
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
      />
    </AppShell>
  );
}
