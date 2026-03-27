import { AppShell } from "../../../../components/app-shell";
import { DataSourceBanner } from "../../../../components/data-source-banner";
import { UnverifiedTeamProfileScreen } from "../../../../components/unverified-team-profile-screen";
import { getUnverifiedTeamPageData } from "../../../../lib/server/repository";
import { requireAdminPageSession } from "../../../../lib/server/services/auth";

export const dynamic = "force-dynamic";

export default async function UnverifiedTeamPage({
  params,
  searchParams
}: {
  params: Promise<{ normalizedName: string }>;
  searchParams?: Promise<{ month?: string }>;
}) {
  const session = await requireAdminPageSession();
  const { normalizedName: rawParam } = await params;
  const normalizedName = decodeURIComponent(rawParam);
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const result = await getUnverifiedTeamPageData(normalizedName, resolvedSearchParams?.month);

  return (
    <AppShell activePath="/admin/unverified" viewer={session.admin}>
      <DataSourceBanner message={result.warning} />
      <UnverifiedTeamProfileScreen data={result.data} />
    </AppShell>
  );
}
