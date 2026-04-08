import { NextResponse } from "next/server";

import { getCurrentAdminSession } from "../../../../lib/server/services/auth";
import { getServiceSupabase, getStorageClient } from "../../../../lib/server/supabase";

const BUCKET_NAME = "ruleset-pdfs";

function unauthorizedResponse() {
  return NextResponse.json({ ok: false, message: "You must be signed in as an admin to use this action." }, { status: 401 });
}

function forbiddenResponse() {
  return NextResponse.json({ ok: false, message: "Only super admins can upload ruleset PDFs." }, { status: 403 });
}

async function ensureBucketExists(storage: ReturnType<typeof getStorageClient>) {
  if (!storage) return;
  const { data: buckets } = await storage.listBuckets();
  const exists = buckets?.some((b) => b.name === BUCKET_NAME);
  if (!exists) {
    await storage.createBucket(BUCKET_NAME, { public: true });
  }
}

export async function POST(request: Request) {
  const session = await getCurrentAdminSession();
  if (!session) {
    return unauthorizedResponse();
  }
  if (session.admin.role !== "super_admin") {
    return forbiddenResponse();
  }

  const formData = await request.formData().catch(() => null);
  if (!formData) {
    return NextResponse.json({ ok: false, message: "Invalid form data." }, { status: 400 });
  }

  const type = formData.get("type");
  const file = formData.get("file");

  if (type !== "public" && type !== "admin") {
    return NextResponse.json({ ok: false, message: "type must be 'public' or 'admin'." }, { status: 400 });
  }

  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, message: "No file provided." }, { status: 400 });
  }

  if (file.type !== "application/pdf") {
    return NextResponse.json({ ok: false, message: "File must be a PDF." }, { status: 400 });
  }

  const storage = getStorageClient();
  if (!storage) {
    return NextResponse.json({ ok: false, message: "Storage not configured." }, { status: 500 });
  }

  const supabase = getServiceSupabase();
  if (!supabase) {
    return NextResponse.json({ ok: false, message: "Database not configured." }, { status: 500 });
  }

  await ensureBucketExists(storage);

  const storagePath = type === "public" ? "public-ruleset.pdf" : "admin-ruleset.pdf";
  const dbColumn = type === "public" ? "public_ruleset_pdf_path" : "admin_ruleset_pdf_path";
  const label = type === "public" ? "Public ruleset" : "Admin ruleset";

  const arrayBuffer = await file.arrayBuffer();
  const buffer = new Uint8Array(arrayBuffer);

  const { error: uploadError } = await storage
    .from(BUCKET_NAME)
    .upload(storagePath, buffer, {
      contentType: "application/pdf",
      upsert: true
    });

  if (uploadError) {
    return NextResponse.json({ ok: false, message: `Upload failed: ${uploadError.message}` }, { status: 500 });
  }

  // Upsert the path into app_settings (update if row exists, insert if not)
  const { data: existing } = await supabase.from("app_settings").select("id").limit(1).maybeSingle();

  if (existing) {
    const { error: dbError } = await supabase
      .from("app_settings")
      .update({ [dbColumn]: storagePath })
      .eq("id", (existing as Record<string, unknown>).id);
    if (dbError) {
      return NextResponse.json({ ok: false, message: `DB update failed: ${dbError.message}` }, { status: 500 });
    }
  } else {
    const { error: dbError } = await supabase
      .from("app_settings")
      .insert({ [dbColumn]: storagePath });
    if (dbError) {
      return NextResponse.json({ ok: false, message: `DB insert failed: ${dbError.message}` }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, message: `${label} PDF uploaded successfully.` });
}
