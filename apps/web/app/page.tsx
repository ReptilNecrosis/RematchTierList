import { AppShell } from "../components/app-shell";
import { DataSourceBanner } from "../components/data-source-banner";
import { PublicTierList } from "../components/public-tier-list";
import { getDashboardData } from "../lib/server/repository";
import { getCurrentAdminSession } from "../lib/server/services/auth";

export const dynamic = "force-dynamic";

function formatShortDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }).replace(",", "");
}

export default async function HomePage() {
  const [result, session] = await Promise.all([getDashboardData(), getCurrentAdminSession()]);

  const lastTournament = result.data.tournaments
    .slice()
    .sort((a, b) => b.eventDate.localeCompare(a.eventDate))[0];
  const lastTournamentLabel = lastTournament ? formatShortDate(lastTournament.eventDate) : undefined;

  const lastActivityDate = result.data.snapshot.activity[0]?.createdAt;
  const lastTierUpdateLabel = lastActivityDate ? formatShortDate(lastActivityDate) : undefined;

  return (
    <AppShell activePath="/" viewer={session?.admin ?? null}>
      <DataSourceBanner message={result.warning} />
      <PublicTierList
        snapshot={result.data.snapshot}
        lastTournamentLabel={lastTournamentLabel}
        lastTierUpdateLabel={lastTierUpdateLabel}
      />
    </AppShell>
  );
}
