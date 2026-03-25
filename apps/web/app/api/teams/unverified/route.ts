import { NextResponse } from "next/server";

import { getCurrentAdminSession } from "../../../../lib/server/services/auth";
import { confirmUnverifiedTeam, rejectUnverifiedTeam } from "../../../../lib/server/services/teams";

export async function POST(request: Request) {
  try {
    const session = await getCurrentAdminSession();
    if (!session) {
      return NextResponse.json({ ok: false, message: "You must be signed in as an admin." }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as {
      action?: "confirm" | "reject";
      normalizedName?: string;
    } | null;

    if (!body || !body.action || !body.normalizedName) {
      return NextResponse.json({ ok: false, message: "action and normalizedName are required." }, { status: 400 });
    }

    if (body.action !== "confirm" && body.action !== "reject") {
      return NextResponse.json({ ok: false, message: "action must be confirm or reject." }, { status: 400 });
    }

    const result =
      body.action === "confirm"
        ? await confirmUnverifiedTeam(body.normalizedName, session.admin.id)
        : await rejectUnverifiedTeam(body.normalizedName, session.admin.id);

    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not process unverified team action.";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
