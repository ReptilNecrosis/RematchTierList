"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { TIER_DEFINITIONS } from "@rematch/rules-engine";
import type { InactivityFlag, StagedMoveValidationIssue, StagedTeamMove, TierId } from "@rematch/shared-types";

function getTierLabel(tierId: TierId) {
  return TIER_DEFINITIONS.find((tier) => tier.id === tierId)?.shortLabel ?? tierId;
}

function getTierRank(tierId: TierId) {
  return TIER_DEFINITIONS.find((tier) => tier.id === tierId)?.rank ?? TIER_DEFINITIONS.length;
}

function buildMoveError(
  payload: { message?: string; issues?: StagedMoveValidationIssue[] } | null,
  fallbackMessage: string
) {
  if (payload?.issues?.length) {
    return payload.issues.map((issue) => issue.message).join(" ");
  }

  return payload?.message ?? fallbackMessage;
}

export function TeamProfileAdminActions({
  teamId,
  teamName,
  liveTierId,
  stagedMove,
  inactivityFlag
}: {
  teamId: string;
  teamName: string;
  liveTierId: TierId;
  stagedMove?: StagedTeamMove;
  inactivityFlag: InactivityFlag;
}) {
  const router = useRouter();
  const effectiveTierId = stagedMove?.stagedTierId ?? liveTierId;
  const effectiveTierRank = getTierRank(effectiveTierId);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [errorPopup, setErrorPopup] = useState<string | null>(null);
  const [successPopup, setSuccessPopup] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteInput, setDeleteInput] = useState("");

  async function handleMove(movementType: "promotion" | "demotion") {
    setBusyAction(movementType);
    setErrorPopup(null);
    setSuccessPopup(null);

    try {
      const response = await fetch("/api/teams/move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "stage",
          teamId,
          movementType
        })
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        message?: string;
        issues?: StagedMoveValidationIssue[];
      };

      if (!response.ok || payload.ok === false) {
        setErrorPopup(buildMoveError(payload, `Could not stage the ${movementType}.`));
        return;
      }

      setSuccessPopup(payload.message ?? `Updated staged ${movementType} for ${teamName}.`);
      router.refresh();
    } catch {
      setErrorPopup(`Could not stage the ${movementType}.`);
    } finally {
      setBusyAction(null);
    }
  }

  async function handleRemoveStagedMove() {
    setBusyAction("remove");
    setErrorPopup(null);
    setSuccessPopup(null);

    try {
      const response = await fetch("/api/teams/move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "remove",
          teamId
        })
      });
      const payload = (await response.json()) as { ok?: boolean; message?: string };

      if (!response.ok || payload.ok === false) {
        setErrorPopup(payload.message ?? "Could not remove the staged move.");
        return;
      }

      setSuccessPopup(payload.message ?? `Removed staged move for ${teamName}.`);
      router.refresh();
    } catch {
      setErrorPopup("Could not remove the staged move.");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleClearInactivity() {
    setBusyAction("inactivity");
    setErrorPopup(null);
    setSuccessPopup(null);

    try {
      const response = await fetch("/api/teams/inactivity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamId })
      });
      const payload = (await response.json()) as { ok?: boolean; message?: string };

      if (!response.ok || payload.ok === false) {
        setErrorPopup(payload.message ?? "Could not clear inactivity.");
        return;
      }

      setSuccessPopup(payload.message ?? `Cleared inactivity for ${teamName}.`);
      router.refresh();
    } catch {
      setErrorPopup("Could not clear inactivity.");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleDelete() {
    setBusyAction("delete");
    setErrorPopup(null);
    try {
      const response = await fetch("/api/teams/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamId })
      });
      const payload = (await response.json()) as { ok?: boolean; message?: string };

      if (!response.ok || payload.ok === false) {
        setErrorPopup(payload.message ?? "Could not delete team.");
        return;
      }

      router.push("/admin");
    } catch {
      setErrorPopup("Could not delete team.");
    } finally {
      setBusyAction(null);
    }
  }

  const canPromote = effectiveTierRank > 1;
  const canDemote = effectiveTierRank < TIER_DEFINITIONS.length;

  return (
    <>
      {errorPopup ? (
        <div className="modal-overlay" onClick={() => setErrorPopup(null)}>
          <div className="modal-box" onClick={(event) => event.stopPropagation()}>
            <div className="modal-title">Cannot Complete Action</div>
            <div className="modal-body">{errorPopup}</div>
            <button className="btn-login" type="button" onClick={() => setErrorPopup(null)}>
              Dismiss
            </button>
          </div>
        </div>
      ) : null}

      {successPopup ? (
        <div className="modal-overlay" onClick={() => setSuccessPopup(null)}>
          <div className="modal-box" onClick={(event) => event.stopPropagation()}>
            <div className="modal-title modal-title-success">Action Completed</div>
            <div className="modal-body">{successPopup}</div>
            <button className="btn-login" type="button" onClick={() => setSuccessPopup(null)}>
              Dismiss
            </button>
          </div>
        </div>
      ) : null}

      <div className="team-admin-meta">
        <span className="team-admin-badge">Live: {getTierLabel(liveTierId)}</span>
        <span className="team-admin-badge">Effective: {getTierLabel(effectiveTierId)}</span>
        {stagedMove ? (
          <span className="team-admin-badge team-admin-badge-active">
            Staged {stagedMove.movementType} to {getTierLabel(stagedMove.stagedTierId)}
          </span>
        ) : null}
        {inactivityFlag !== "none" ? (
          <span className="team-admin-badge">
            {inactivityFlag === "red" ? "Red" : "Yellow"} inactivity flag
          </span>
        ) : null}
      </div>

      <div className="team-admin-actions">
        {canPromote ? (
          <button
            className="p-action p-up"
            type="button"
            disabled={busyAction !== null}
            onClick={() => {
              void handleMove("promotion");
            }}
          >
            {busyAction === "promotion" ? "Promoting..." : "Promote"}
          </button>
        ) : null}

        {canDemote ? (
          <button
            className="p-action p-down"
            type="button"
            disabled={busyAction !== null}
            onClick={() => {
              void handleMove("demotion");
            }}
          >
            {busyAction === "demotion" ? "Demoting..." : "Demote"}
          </button>
        ) : null}

        {stagedMove ? (
          <button
            className="p-action p-review"
            type="button"
            disabled={busyAction !== null}
            onClick={() => {
              void handleRemoveStagedMove();
            }}
          >
            {busyAction === "remove" ? "Removing..." : "Remove Staged Move"}
          </button>
        ) : null}

        {inactivityFlag !== "none" ? (
          <button
            className="p-action p-review"
            type="button"
            disabled={busyAction !== null}
            onClick={() => {
              void handleClearInactivity();
            }}
          >
            {busyAction === "inactivity" ? "Clearing..." : "Clear Inactivity"}
          </button>
        ) : null}
      </div>

      <div className="team-admin-delete-zone">
        {!showDeleteConfirm ? (
          <button
            className="p-action p-delete"
            type="button"
            disabled={busyAction !== null}
            onClick={() => {
              setShowDeleteConfirm(true);
              setDeleteInput("");
            }}
          >
            Delete Team
          </button>
        ) : (
          <div className="team-admin-delete-confirm">
            <p className="team-admin-delete-label">
              Type <strong>{teamName}</strong> to confirm deletion:
            </p>
            <input
              className="team-admin-delete-input"
              type="text"
              value={deleteInput}
              onChange={(e) => {
                setDeleteInput(e.target.value);
              }}
              placeholder={teamName}
              autoFocus
            />
            <div className="team-admin-delete-confirm-actions">
              <button
                className="p-action p-delete"
                type="button"
                disabled={deleteInput !== teamName || busyAction !== null}
                onClick={() => {
                  void handleDelete();
                }}
              >
                {busyAction === "delete" ? "Deleting..." : "Confirm Delete"}
              </button>
              <button
                className="p-action p-review"
                type="button"
                disabled={busyAction !== null}
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setDeleteInput("");
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
