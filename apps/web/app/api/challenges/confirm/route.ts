import { NextResponse } from "next/server";
import type { ChallengeSeries } from "@rematch/shared-types";

import { getCurrentAdminSession } from "../../../../lib/server/services/auth";
import { confirmChallenge } from "../../../../lib/server/services/challenges";

export async function POST(request: Request) {
  const session = await getCurrentAdminSession();
  if (!session) {
    return NextResponse.json(
      { ok: false, message: "You must be signed in as an admin." },
      { status: 401 }
    );
  }

  const body = (await request.json()) as Partial<ChallengeSeries>;

  if (
    !body.challengerTeamId ||
    !body.defenderTeamId ||
    !body.challengerTierId ||
    !body.defenderTierId ||
    !body.reason ||
    !body.blockedMovement
  ) {
    return NextResponse.json(
      { ok: false, message: "Invalid challenge data." },
      { status: 400 }
    );
  }

  const result = await confirmChallenge(body as ChallengeSeries, session.admin.id);
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
