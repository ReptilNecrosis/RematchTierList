import { NextResponse } from "next/server";

import { getHeadToHeadData } from "../../../../lib/server/repository";

export async function GET() {
  const data = await getHeadToHeadData();
  return NextResponse.json({ ok: true, ...data });
}
