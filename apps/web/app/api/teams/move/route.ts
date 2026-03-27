import { NextResponse } from "next/server";

import { getCurrentAdminSession } from "../../../../lib/server/services/auth";
import { moveTeam } from "../../../../lib/server/services/teams";

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
    teamId?: string;
    movementType?: "promotion" | "demotion";
  };

  if (!body.teamId || !body.movementType) {
    return NextResponse.json(
      {
        ok: false,
        message: "teamId and movementType are required."
      },
      { status: 400 }
    );
  }

  const result = await moveTeam({
    teamId: body.teamId,
    movementType: body.movementType,
    actorAdminId: session.admin.id
  });
  return NextResponse.json(result, {
    status: result.ok ? 200 : 400
  });
}
