import { AppShell } from "../../../../components/app-shell";
import { DataSourceBanner } from "../../../../components/data-source-banner";
import { UnverifiedTeamProfileScreen } from "../../../../components/unverified-team-profile-screen";
import { getUnverifiedTeamPageData } from "../../../../lib/server/repository";
import { getCurrentAdminSession } from "../../../../lib/server/services/auth";

export const dynamic = "force-dynamic";

export default async function UnverifiedTeamPage({
  params,
  searchParams
}: {
  params: Promise<{ normalizedName: string }>;
  searchParams?: Promise<{ month?: string }>;
}) {
  const session = await getCurrentAdminSession();
  const { normalizedName: rawParam } = await params;
  const normalizedName = decodeURIComponent(rawParam);
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const result = await getUnverifiedTeamPageData(normalizedName, resolvedSearchParams?.month);

  const content = (
    <>
      <DataSourceBanner message={result.warning} />
      <UnverifiedTeamProfileScreen data={result.data} />
    </>
  );
  if (session) {
    return (
      <AppShell activePath="/admin/unverified" viewer={session.admin}>
        {content}
      </AppShell>
    );
  }
  return <main>{content}</main>;
}
