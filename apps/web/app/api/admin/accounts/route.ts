import { NextResponse } from "next/server";

import {
  createAdminAccount,
  deleteAdminAccount,
  getCurrentAdminSession,
  resetAdminPassword
} from "../../../../lib/server/services/auth";

function unauthorizedResponse() {
  return NextResponse.json(
    {
      ok: false,
      message: "You must be signed in as an admin to use this action."
    },
    { status: 401 }
  );
}

export async function POST(request: Request) {
  const session = await getCurrentAdminSession();
  if (!session) {
    return unauthorizedResponse();
  }

  const body = (await request.json().catch(() => ({}))) as {
    action?: "create" | "reset_password" | "delete";
    username?: string;
    displayName?: string;
    role?: "super_admin" | "admin";
    password?: string;
    adminId?: string;
  };

  try {
    if (body.action === "create") {
      const result = await createAdminAccount(session, {
        username: body.username ?? "",
        displayName: body.displayName ?? "",
        role: body.role === "super_admin" ? "super_admin" : "admin",
        password: body.password ?? ""
      });

      return NextResponse.json(result, {
        status: result.ok ? 200 : 400
      });
    }

    if (body.action === "reset_password") {
      const result = await resetAdminPassword(session, {
        adminId: body.adminId ?? "",
        password: body.password ?? ""
      });

      return NextResponse.json(result, {
        status: result.ok ? 200 : 400
      });
    }

    if (body.action === "delete") {
      const result = await deleteAdminAccount(session, {
        adminId: body.adminId ?? ""
      });

      return NextResponse.json(result, {
        status: result.ok ? 200 : 400
      });
    }

    return NextResponse.json(
      {
        ok: false,
        message: "Unknown admin action."
      },
      { status: 400 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Admin action failed."
      },
      { status: 500 }
    );
  }
}

export const dynamic = "force-dynamic";
