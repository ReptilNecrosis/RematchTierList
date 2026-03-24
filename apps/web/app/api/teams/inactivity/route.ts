import { NextResponse } from "next/server";

import { getCurrentAdminSession } from "../../../../lib/server/services/auth";
import { clearInactivity } from "../../../../lib/server/services/teams";

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
  };

  if (!body.teamId) {
    return NextResponse.json(
      {
        ok: false,
        message: "teamId is required."
      },
      { status: 400 }
    );
  }

  const result = await clearInactivity(body.teamId);
  return NextResponse.json(result, {
    status: result.ok ? 200 : 400
  });
}
