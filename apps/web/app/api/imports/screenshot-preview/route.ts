import { NextResponse } from "next/server";

import { getCurrentAdminSession } from "../../../../lib/server/services/auth";
import { previewScreenshotImport } from "../../../../lib/server/services/imports";

export async function POST(request: Request) {
  try {
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

    const formData = await request.formData();
    const tournamentTitle = String(formData.get("tournamentTitle") ?? "");
    const eventDate = String(formData.get("eventDate") ?? "");
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        {
          ok: false,
          message: "Screenshot file is required."
        },
        { status: 400 }
      );
    }

    const result = await previewScreenshotImport({
      tournamentTitle,
      eventDate,
      fileName: file.name,
      mimeType: file.type || "image/png",
      fileBuffer: await file.arrayBuffer()
    });

    return NextResponse.json(result, {
      status: result.ok ? 200 : 400
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Screenshot parsing failed."
      },
      { status: 500 }
    );
  }
}
