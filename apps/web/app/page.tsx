import { AppShell } from "../components/app-shell";
import { DataSourceBanner } from "../components/data-source-banner";
import { PublicTierList } from "../components/public-tier-list";
import { latestTierUpdateLabel } from "../lib/sample-data/demo";
import { getDashboardData } from "../lib/server/repository";
import { getCurrentAdminSession } from "../lib/server/services/auth";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [result, session] = await Promise.all([getDashboardData(), getCurrentAdminSession()]);
  return (
    <AppShell activePath="/" viewer={session?.admin ?? null}>
      <DataSourceBanner message={result.warning} />
      <PublicTierList snapshot={result.data.snapshot} lastUpdatedLabel={latestTierUpdateLabel} />
    </AppShell>
  );
}
