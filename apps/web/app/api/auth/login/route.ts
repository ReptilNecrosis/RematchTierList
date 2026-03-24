import { NextResponse } from "next/server";

import { loginAdmin } from "../../../../lib/server/services/auth";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { username?: string; password?: string };
  const username = body.username?.trim() ?? "";
  const password = body.password ?? "";

  try {
    const result = await loginAdmin(username, password);
    return NextResponse.json(result, {
      status: result.ok ? 200 : 400
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Login failed."
      },
      { status: 500 }
    );
  }
}

export const dynamic = "force-dynamic";
