"use client";

import { useEffect, useState } from "react";
import { Toast } from "./toast";
import { useRouter } from "next/navigation";
import { TIER_DEFINITIONS } from "@rematch/rules-engine";
import type {
  HeadToHeadTeam,
  InactivityFlag,
  StagedMoveValidationIssue,
  StagedTeamMove,
  TierId
} from "@rematch/shared-types";

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
  teamShortCode,
  liveTierId,
  stagedMove,
  inactivityFlag,
  allTeams
}: {
  teamId: string;
  teamName: string;
  teamShortCode: string;
  liveTierId: TierId;
  stagedMove?: StagedTeamMove;
  inactivityFlag: InactivityFlag;
  allTeams: HeadToHeadTeam[];
}) {
  const router = useRouter();
  const effectiveTierId = stagedMove?.stagedTierId ?? liveTierId;
  const effectiveTierRank = getTierRank(effectiveTierId);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [errorPopup, setErrorPopup] = useState<string | null>(null);
  const [successPopup, setSuccessPopup] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteInput, setDeleteInput] = useState("");
  const [renameInput, setRenameInput] = useState(teamName);
  const [tagInput, setTagInput] = useState(teamShortCode);
  const mergeTargets = allTeams
    .filter((entry) => entry.id !== teamId)
    .sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: "base" }));
  const [mergeTargetId, setMergeTargetId] = useState(mergeTargets[0]?.id ?? "");

  useEffect(() => {
    setRenameInput(teamName);
    setTagInput(teamShortCode);
  }, [teamName, teamShortCode]);

  useEffect(() => {
    setMergeTargetId((current) => {
      if (mergeTargets.some((entry) => entry.id === current)) {
        return current;
      }

      return mergeTargets[0]?.id ?? "";
    });
  }, [teamId, mergeTargets]);

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

  async function handleRename() {
    setBusyAction("rename");
    setErrorPopup(null);
    setSuccessPopup(null);

    try {
      const response = await fetch("/api/teams/rename", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId,
          nextName: renameInput,
          nextShortCode: tagInput
        })
      });
      const payload = (await response.json()) as { ok?: boolean; message?: string };

      if (!response.ok || payload.ok === false) {
        setErrorPopup(payload.message ?? "Could not rename team.");
        return;
      }

      setSuccessPopup(payload.message ?? `Renamed ${teamName}.`);
      router.refresh();
    } catch {
      setErrorPopup("Could not rename team.");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleMerge() {
    setBusyAction("merge");
    setErrorPopup(null);
    setSuccessPopup(null);

    try {
      const response = await fetch("/api/teams/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceTeamId: teamId,
          targetTeamId: mergeTargetId
        })
      });
      const payload = (await response.json()) as { ok?: boolean; message?: string; teamId?: string };

      if (!response.ok || payload.ok === false) {
        setErrorPopup(payload.message ?? "Could not merge team.");
        return;
      }

      if (payload.teamId) {
        router.push(`/teams/${mergeTargets.find((entry) => entry.id === payload.teamId)?.slug ?? ""}`);
        router.refresh();
        return;
      }

      setSuccessPopup(payload.message ?? `Merged ${teamName}.`);
      router.refresh();
    } catch {
      setErrorPopup("Could not merge team.");
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
        <Toast message={successPopup} onDismiss={() => setSuccessPopup(null)} />
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
        <div className="team-admin-identity-group">
          <div className="form-stack settings-form-block team-admin-name-field">
            <span className="form-label">Team Name</span>
            <input
              className="form-input"
              type="text"
              value={renameInput}
              onChange={(event) => {
                setRenameInput(event.target.value);
              }}
              placeholder="Enter a new team name"
              disabled={busyAction !== null}
            />
          </div>
          <div className="form-stack settings-form-block team-admin-tag-field">
            <span className="form-label">Tag</span>
            <input
              className="form-input"
              type="text"
              value={tagInput}
              onChange={(event) => {
                setTagInput(event.target.value);
              }}
              placeholder="Team tag"
              disabled={busyAction !== null}
            />
          </div>
          <button
            className="p-action p-review team-admin-identity-save"
            type="button"
            disabled={
              busyAction !== null ||
              renameInput.trim().length === 0 ||
              tagInput.trim().length === 0 ||
              (renameInput.trim() === teamName && tagInput.trim() === teamShortCode)
            }
            onClick={() => {
              void handleRename();
            }}
          >
            {busyAction === "rename" ? "Saving..." : "Save Identity"}
          </button>
        </div>

        <div className="team-admin-identity-group">
          <div className="form-stack settings-form-block team-admin-name-field">
            <span className="form-label">Merge Into Team</span>
            <select
              className="form-input"
              value={mergeTargetId}
              onChange={(event) => {
                setMergeTargetId(event.target.value);
              }}
              disabled={busyAction !== null || mergeTargets.length === 0}
            >
              {mergeTargets.length === 0 ? <option value="">No other verified teams</option> : null}
              {mergeTargets.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name}
                </option>
              ))}
            </select>
          </div>
          <button
            className="p-action p-down team-admin-identity-save"
            type="button"
            disabled={busyAction !== null || !mergeTargetId}
            onClick={() => {
              void handleMerge();
            }}
          >
            {busyAction === "merge" ? "Merging..." : "Merge Profile"}
          </button>
        </div>
      </div>

      <div className="team-admin-delete-zone">
        <div className="team-admin-secondary-actions">
          {canPromote ? (
            <button
              className="p-action p-up team-admin-compact-action"
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
              className="p-action p-down team-admin-compact-action"
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
              className="p-action p-review team-admin-compact-action"
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
              className="p-action p-review team-admin-compact-action"
              type="button"
              disabled={busyAction !== null}
              onClick={() => {
                void handleClearInactivity();
              }}
            >
              {busyAction === "inactivity" ? "Clearing..." : "Clear Inactivity"}
            </button>
          ) : null}

          {!showDeleteConfirm ? (
            <button
              className="p-action p-delete team-admin-compact-action"
              type="button"
              disabled={busyAction !== null}
              onClick={() => {
                setShowDeleteConfirm(true);
                setDeleteInput("");
              }}
            >
              Delete Team
            </button>
          ) : null}
        </div>

        {!showDeleteConfirm ? (
          null
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
