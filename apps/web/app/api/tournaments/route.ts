import { NextResponse } from "next/server";
import type { TournamentRecord } from "@rematch/shared-types";

import { getCurrentAdminSession } from "../../../lib/server/services/auth";
import { getServiceSupabase } from "../../../lib/server/supabase";
import { tournaments as demoTournaments } from "../../../lib/sample-data/demo";

export async function GET() {
  const session = await getCurrentAdminSession();
  if (!session) {
    return NextResponse.json(
      { ok: false, message: "You must be signed in as an admin." },
      { status: 401 }
    );
  }

  const client = getServiceSupabase();
  if (!client) {
    return NextResponse.json({ ok: true, tournaments: demoTournaments });
  }

  const { data: tournamentRows, error: tError } = await client
    .from("tournaments")
    .select("id, title, event_date, created_at, created_by")
    .order("event_date", { ascending: false });

  if (tError) {
    return NextResponse.json(
      { ok: false, message: tError.message },
      { status: 500 }
    );
  }

  const tournamentIds = ((tournamentRows ?? []) as Array<Record<string, unknown>>).map((r) =>
    String(r.id)
  );

  let sourceRows: Array<Record<string, unknown>> = [];
  if (tournamentIds.length > 0) {
    const { data: sources } = await client
      .from("tournament_sources")
      .select("id, tournament_id, url, source_type")
      .in("tournament_id", tournamentIds);
    sourceRows = ((sources ?? []) as Array<Record<string, unknown>>);
  }

  const sourcesByTournament = new Map<string, typeof sourceRows>();
  for (const row of sourceRows) {
    const tid = String(row.tournament_id);
    if (!sourcesByTournament.has(tid)) sourcesByTournament.set(tid, []);
    sourcesByTournament.get(tid)!.push(row);
  }

  const tournaments: TournamentRecord[] = ((tournamentRows ?? []) as Array<Record<string, unknown>>).map(
    (row) => ({
      id: String(row.id),
      title: String(row.title),
      eventDate: String(row.event_date),
      createdAt: String(row.created_at),
      createdBy: row.created_by ? String(row.created_by) : "unknown",
      sourceLinks: (sourcesByTournament.get(String(row.id)) ?? []).map((s) => ({
        id: String(s.id),
        url: String(s.url),
        source:
          s.source_type === "startgg"
            ? "startgg"
            : s.source_type === "screenshot"
              ? "screenshot"
              : "battlefy"
      }))
    })
  );

  return NextResponse.json({ ok: true, tournaments });
}
