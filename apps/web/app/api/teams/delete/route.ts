import { NextResponse } from "next/server";

import { getCurrentAdminSession } from "../../../../lib/server/services/auth";
import { softDeleteTeam } from "../../../../lib/server/services/teams";

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

    const body = (await request.json().catch(() => null)) as {
      teamId?: string;
    } | null;

    if (!body?.teamId) {
      return NextResponse.json(
        {
          ok: false,
          message: "teamId is required."
        },
        { status: 400 }
      );
    }

    const result = await softDeleteTeam(body.teamId, session.admin.id);
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Could not delete the team."
      },
      { status: 500 }
    );
  }
}
