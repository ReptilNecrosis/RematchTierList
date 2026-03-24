import { NextResponse } from "next/server";

import { getCurrentAdminSession } from "../../../../lib/server/services/auth";
import { previewImport } from "../../../../lib/server/services/imports";

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
    tournamentTitle?: string;
    eventDate?: string;
    sourceLinks?: string[];
  };

  const result = await previewImport({
    tournamentTitle: body.tournamentTitle ?? "",
    eventDate: body.eventDate ?? "",
    sourceLinks: body.sourceLinks ?? []
  });

  return NextResponse.json(result, {
    status: result.ok ? 200 : 400
  });
}
