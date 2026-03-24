import { NextResponse } from "next/server";

import { getCurrentAdminSession } from "../../../../lib/server/services/auth";
import { resyncDiscordSummary } from "../../../../lib/server/services/discord";

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

  const body = (await request.json().catch(() => ({ mode: "summary" }))) as {
    mode?: "summary" | "test";
  };

  try {
    const result = await resyncDiscordSummary(body.mode ?? "summary");
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Discord sync failed."
      },
      { status: 500 }
    );
  }
}
