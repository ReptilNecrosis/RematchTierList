import { NextResponse } from "next/server";

import { getCurrentAdminSession } from "../../../../lib/server/services/auth";
import { stageInactiveRemovals } from "../../../../lib/server/services/teams";

export async function POST(request: Request) {
  const session = await getCurrentAdminSession();
  if (!session) {
    return NextResponse.json({ ok: false, message: "You must be signed in as an admin." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    action?: string;
    teamIds?: string[];
  } | null;

  if (!body?.action) {
    return NextResponse.json({ ok: false, message: "action is required." }, { status: 400 });
  }

  if (body.action === "stage") {
    if (!Array.isArray(body.teamIds) || body.teamIds.length === 0) {
      return NextResponse.json({ ok: false, message: "teamIds array is required." }, { status: 400 });
    }
    const result = await stageInactiveRemovals(body.teamIds, session.admin.id);
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  }

  return NextResponse.json({ ok: false, message: "Unknown action." }, { status: 400 });
}
