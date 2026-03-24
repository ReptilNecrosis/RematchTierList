import { AppShell } from "../components/app-shell";
import { DataSourceBanner } from "../components/data-source-banner";
import { PublicTierList } from "../components/public-tier-list";
import { latestTierUpdateLabel } from "../lib/sample-data/demo";
import { getDashboardData } from "../lib/server/repository";

export default async function HomePage() {
  const result = await getDashboardData();
  return (
    <AppShell activePath="/" viewer={null}>
      <DataSourceBanner message={result.warning} />
      <PublicTierList snapshot={result.data.snapshot} lastUpdatedLabel={latestTierUpdateLabel} />
    </AppShell>
  );
}
