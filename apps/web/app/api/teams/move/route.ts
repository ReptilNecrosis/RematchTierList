import { NextResponse } from "next/server";

import { getAdminPendingMovementFlags } from "../../../../lib/server/repository";
import { getCurrentAdminSession } from "../../../../lib/server/services/auth";
import {
  moveTeam,
  publishStagedMoves,
  removeStagedMove,
  resetStagedMoves,
  stagePendingMoves
} from "../../../../lib/server/services/teams";
import type { PublishPhase, TierId } from "@rematch/shared-types";

function isTierId(value: unknown): value is TierId {
  return (
    value === "tier1" ||
    value === "tier2" ||
    value === "tier3" ||
    value === "tier4" ||
    value === "tier5" ||
    value === "tier6" ||
    value === "tier7"
  );
}

function isSeasonKey(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^\d{4}-(0[1-9]|1[0-2])$/.test(value)
  );
}

function isPublishPhase(value: unknown): value is PublishPhase {
  return value === "midseason" || value === "end_season";
}

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
    action?: "stage" | "stage_bulk_pending" | "remove" | "publish" | "reset";
    teamId?: string;
    movementType?: "promotion" | "demotion";
    targetTierId?: string;
    selectedSeasonKey?: string;
    publishPhase?: PublishPhase;
  };

  const action = body.action ?? "stage";
  let result:
    | Awaited<ReturnType<typeof moveTeam>>
    | Awaited<ReturnType<typeof stagePendingMoves>>
    | Awaited<ReturnType<typeof removeStagedMove>>
    | Awaited<ReturnType<typeof publishStagedMoves>>
    | Awaited<ReturnType<typeof resetStagedMoves>>;

  if (action === "stage") {
    if (!body.teamId || (!body.movementType && !body.targetTierId)) {
      return NextResponse.json(
        {
          ok: false,
          message: "teamId plus movementType or targetTierId is required."
        },
        { status: 400 }
      );
    }

    if (body.targetTierId && !isTierId(body.targetTierId)) {
      return NextResponse.json(
        {
          ok: false,
          message: "targetTierId must be a valid tier."
        },
        { status: 400 }
      );
    }

    const targetTierId = body.targetTierId && isTierId(body.targetTierId) ? body.targetTierId : undefined;

    result = await moveTeam({
      teamId: body.teamId,
      movementType: body.movementType,
      targetTierId,
      actorAdminId: session.admin.id
    });
  } else if (action === "stage_bulk_pending") {
    if (body.selectedSeasonKey !== undefined && !isSeasonKey(body.selectedSeasonKey)) {
      return NextResponse.json(
        {
          ok: false,
          message: "selectedSeasonKey must use YYYY-MM."
        },
        { status: 400 }
      );
    }

    const pendingFlagsResult = await getAdminPendingMovementFlags(body.selectedSeasonKey);
    result = await stagePendingMoves({
      pendingFlags: pendingFlagsResult.data,
      actorAdminId: session.admin.id
    });
  } else if (action === "remove") {
    if (!body.teamId) {
      return NextResponse.json(
        {
          ok: false,
          message: "teamId is required."
        },
        { status: 400 }
      );
    }

    result = await removeStagedMove(body.teamId);
  } else if (action === "publish") {
    if (!isPublishPhase(body.publishPhase)) {
      return NextResponse.json(
        {
          ok: false,
          message: "publishPhase must be midseason or end_season."
        },
        { status: 400 }
      );
    }

    if (!isSeasonKey(body.selectedSeasonKey)) {
      return NextResponse.json(
        {
          ok: false,
          message: "selectedSeasonKey must use YYYY-MM."
        },
        { status: 400 }
      );
    }

    result = await publishStagedMoves({
      actorAdminId: session.admin.id,
      publishPhase: body.publishPhase,
      selectedSeasonKey: body.selectedSeasonKey
    });
  } else if (action === "reset") {
    result = await resetStagedMoves();
  } else {
    return NextResponse.json(
      {
        ok: false,
        message: "Unknown action."
      },
      { status: 400 }
    );
  }

  return NextResponse.json(result, {
    status: result.ok ? 200 : 400
  });
}
