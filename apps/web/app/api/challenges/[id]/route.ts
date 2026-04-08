import { NextResponse } from "next/server";

import { getCurrentAdminSession } from "../../../../lib/server/services/auth";
import { deleteChallenge } from "../../../../lib/server/services/challenges";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getCurrentAdminSession();
  if (!session) {
    return NextResponse.json(
      { ok: false, message: "You must be signed in as an admin." },
      { status: 401 }
    );
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ ok: false, message: "Missing challenge id." }, { status: 400 });
  }

  const result = await deleteChallenge(id);
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
