import { NextResponse } from "next/server";

import { getCurrentAdminSession } from "../../../../lib/server/services/auth";
import {
  moveTeam,
  publishStagedMoves,
  removeStagedMove,
  resetStagedMoves
} from "../../../../lib/server/services/teams";

export async function POST(request: Request) {
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

  const body = (await request.json()) as {
    action?: "stage" | "remove" | "publish" | "reset";
    teamId?: string;
    movementType?: "promotion" | "demotion";
  };

  const action = body.action ?? "stage";
  let result:
    | Awaited<ReturnType<typeof moveTeam>>
    | Awaited<ReturnType<typeof removeStagedMove>>
    | Awaited<ReturnType<typeof publishStagedMoves>>
    | Awaited<ReturnType<typeof resetStagedMoves>>;

  if (action === "stage") {
    if (!body.teamId || !body.movementType) {
      return NextResponse.json(
        {
          ok: false,
          message: "teamId and movementType are required."
        },
        { status: 400 }
      );
    }

    result = await moveTeam({
      teamId: body.teamId,
      movementType: body.movementType,
      actorAdminId: session.admin.id
    });
  } else if (action === "remove") {
    if (!body.teamId) {
      return NextResponse.json(
        {
          ok: false,
          message: "teamId is required."
        },
        { status: 400 }
      );
    }

    result = await removeStagedMove(body.teamId);
  } else if (action === "publish") {
    result = await publishStagedMoves(session.admin.id);
  } else if (action === "reset") {
    result = await resetStagedMoves();
  } else {
    return NextResponse.json(
      {
        ok: false,
        message: "Unknown action."
      },
      { status: 400 }
    );
  }

  return NextResponse.json(result, {
    status: result.ok ? 200 : 400
  });
}
