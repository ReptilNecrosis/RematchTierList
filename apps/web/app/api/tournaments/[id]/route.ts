import { NextResponse } from "next/server";

import { getCurrentAdminSession } from "../../../../lib/server/services/auth";
import { reimportTournamentSeries } from "../../../../lib/server/services/imports";
import { getServiceSupabase } from "../../../../lib/server/supabase";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getCurrentAdminSession();
  if (!session) {
    return NextResponse.json(
      { ok: false, message: "You must be signed in as an admin." },
      { status: 401 }
    );
  }

  const { id } = await params;
  const client = getServiceSupabase();
  if (!client) {
    return NextResponse.json(
      { ok: false, message: "Database not available." },
      { status: 503 }
    );
  }

  const { error: seriesError } = await client
    .from("series_results")
    .delete()
    .eq("tournament_id", id);
  if (seriesError) {
    return NextResponse.json(
      { ok: false, message: `Could not delete series: ${seriesError.message}` },
      { status: 500 }
    );
  }

  const { error: sourcesError } = await client
    .from("tournament_sources")
    .delete()
    .eq("tournament_id", id);
  if (sourcesError) {
    return NextResponse.json(
      { ok: false, message: `Could not delete sources: ${sourcesError.message}` },
      { status: 500 }
    );
  }

  const { error: tournamentError } = await client
    .from("tournaments")
    .delete()
    .eq("id", id);
  if (tournamentError) {
    return NextResponse.json(
      { ok: false, message: `Could not delete tournament: ${tournamentError.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getCurrentAdminSession();
  if (!session) {
    return NextResponse.json(
      { ok: false, message: "You must be signed in as an admin." },
      { status: 401 }
    );
  }

  const { id } = await params;
  const body = (await request.json().catch(() => null)) as { action?: string } | null;

  if (body?.action === "reimport") {
    try {
      const result = await reimportTournamentSeries(id);
      return NextResponse.json(result, { status: result.ok ? 200 : 400 });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Re-import failed.";
      return NextResponse.json({ ok: false, added: 0, message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: false, message: "Unknown action." }, { status: 400 });
}
