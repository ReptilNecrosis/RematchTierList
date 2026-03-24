import { NextResponse } from "next/server";

import { bootstrapFirstAdmin } from "../../../../lib/server/services/auth";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    username?: string;
    displayName?: string;
    password?: string;
  };

  try {
    const result = await bootstrapFirstAdmin({
      username: body.username ?? "",
      displayName: body.displayName ?? "",
      password: body.password ?? ""
    });

    return NextResponse.json(result, {
      status: result.ok ? 200 : 400
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Bootstrap failed."
      },
      { status: 500 }
    );
  }
}

export const dynamic = "force-dynamic";
