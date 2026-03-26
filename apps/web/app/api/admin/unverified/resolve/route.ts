import { NextResponse } from "next/server";
import type { ResolveUnverifiedRequest } from "@rematch/shared-types";

import { getCurrentAdminSession } from "../../../../../lib/server/services/auth";
import { resolveUnverifiedTeam } from "../../../../../lib/server/services/unverified";

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

  const body = (await request.json().catch(() => null)) as ResolveUnverifiedRequest | null;
  if (!body?.action || !body.normalizedName) {
    return NextResponse.json(
      {
        ok: false,
        message: "action and normalizedName are required."
      },
      { status: 400 }
    );
  }

  const result = await resolveUnverifiedTeam(body, session.admin.id);
  return NextResponse.json(result, {
    status: result.ok ? 200 : 400
  });
}
