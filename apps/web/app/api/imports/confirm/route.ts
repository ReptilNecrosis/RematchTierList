import { NextResponse } from "next/server";

import { getCurrentAdminSession } from "../../../../lib/server/services/auth";
import { confirmImport, confirmPreviewImport } from "../../../../lib/server/services/imports";

export async function POST(request: Request) {
  try {
    const session = await getCurrentAdminSession();
    if (!session) {
      return NextResponse.json(
        {
          ok: false,
          message: "You must be signed in as an admin."
        },
        { status: 401 }
      );
    }

    const body = (await request.json().catch(() => null)) as
      | {
          tournamentTitle?: string;
          eventDate?: string;
          sourceMode?: "links" | "screenshot";
          sourceLinks?: string[];
          previewRows?: Array<{
            id: string;
            playedAt: string;
            source: "battlefy" | "startgg" | "screenshot";
            bracketLabel?: string;
            roundLabel?: string;
            matchLabel?: string;
            teamOne: {
              name: string;
              status: "matched" | "unmatched" | "ambiguous";
              matchedTeamId?: string;
              candidates?: string[];
            };
            teamTwo: {
              name: string;
              status: "matched" | "unmatched" | "ambiguous";
              matchedTeamId?: string;
              candidates?: string[];
            };
            winnerName: string;
            score: string;
          }>;
          resolutions?: Array<{
            rowId: string;
            teamOneTeamId?: string | null;
            teamTwoTeamId?: string | null;
            teamOneMode?: "match" | "unverified";
            teamTwoMode?: "match" | "unverified";
          }>;
        }
      | null;

    if (!body || !body.previewRows) {
      const result = await confirmImport();
      return NextResponse.json(result);
    }

    const result = await confirmPreviewImport({
      tournamentTitle: body.tournamentTitle ?? "",
      eventDate: body.eventDate ?? "",
      sourceMode: body.sourceMode ?? "links",
      sourceLinks: body.sourceLinks ?? [],
      previewRows: body.previewRows,
      resolutions: body.resolutions ?? [],
      actorAdminId: session.admin.id
    });

    return NextResponse.json(result, {
      status: result.ok ? 200 : 400
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not confirm this import.";
    const isDuplicateImport = message.toLowerCase().includes("already imported");

    return NextResponse.json(
      {
        ok: false,
        message
      },
      { status: isDuplicateImport ? 400 : 500 }
    );
  }
}
