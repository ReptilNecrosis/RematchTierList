import { NextResponse } from "next/server";

import { getCurrentAdminSession } from "../../../../lib/server/services/auth";
import { renameTeam } from "../../../../lib/server/services/teams";

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
          teamId?: string;
          nextName?: string;
        }
      | null;

    if (!body?.teamId || !body?.nextName) {
      return NextResponse.json(
        {
          ok: false,
          message: "teamId and nextName are required."
        },
        { status: 400 }
      );
    }

    const result = await renameTeam({
      teamId: body.teamId,
      nextName: body.nextName,
      actorAdminId: session.admin.id
    });

    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Could not rename the team."
      },
      { status: 500 }
    );
  }
}
