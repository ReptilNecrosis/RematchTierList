import { NextResponse } from "next/server";

import { getCurrentAdminSession } from "../../../../lib/server/services/auth";
import { getServiceSupabase } from "../../../../lib/server/supabase";

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
  const client = getServiceSupabase();
  if (!client) {
    return NextResponse.json(
      { ok: false, message: "Database not available." },
      { status: 503 }
    );
  }

  const { error } = await client
    .from("series_results")
    .delete()
    .eq("id", id);

  if (error) {
    return NextResponse.json(
      { ok: false, message: `Could not delete series: ${error.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, message: "Series result removed." });
}
