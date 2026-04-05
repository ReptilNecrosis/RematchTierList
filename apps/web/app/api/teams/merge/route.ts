import { NextResponse } from "next/server";

import { getCurrentAdminSession } from "../../../../lib/server/services/auth";
import { mergeVerifiedTeamIntoExistingTeam } from "../../../../lib/server/services/team-merge";

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
          sourceTeamId?: string;
          targetTeamId?: string;
        }
      | null;

    if (!body?.sourceTeamId || !body?.targetTeamId) {
      return NextResponse.json(
        {
          ok: false,
          message: "sourceTeamId and targetTeamId are required."
        },
        { status: 400 }
      );
    }

    const result = await mergeVerifiedTeamIntoExistingTeam({
      sourceTeamId: body.sourceTeamId,
      targetTeamId: body.targetTeamId,
      actorAdminId: session.admin.id
    });

    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Could not merge the team."
      },
      { status: 500 }
    );
  }
}
