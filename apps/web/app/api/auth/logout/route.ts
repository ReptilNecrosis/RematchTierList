import { NextResponse } from "next/server";

import { logoutAdmin } from "../../../../lib/server/services/auth";

export async function POST() {
  try {
    const result = await logoutAdmin();
    return NextResponse.json(result, {
      status: result.ok ? 200 : 400
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Logout failed."
      },
      { status: 500 }
    );
  }
}

export const dynamic = "force-dynamic";
