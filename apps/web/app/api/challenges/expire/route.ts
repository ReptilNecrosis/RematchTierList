import { NextResponse } from "next/server";

import { getCurrentAdminSession } from "../../../../lib/server/services/auth";
import { expireStaleChallenges } from "../../../../lib/server/services/challenges";

export async function POST() {
  const session = await getCurrentAdminSession();
  if (!session) {
    return NextResponse.json(
      { ok: false, message: "You must be signed in as an admin." },
      { status: 401 }
    );
  }

  const result = await expireStaleChallenges();
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
