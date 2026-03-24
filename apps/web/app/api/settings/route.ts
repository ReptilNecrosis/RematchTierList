import { NextResponse } from "next/server";

import { getCurrentAdminSession } from "../../../lib/server/services/auth";
import { getSettingsSummary, saveSettings } from "../../../lib/server/services/settings";

export async function GET() {
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

  const result = await getSettingsSummary();
  return NextResponse.json(result);
}

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

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const result = await saveSettings(body);
  return NextResponse.json(result);
}
