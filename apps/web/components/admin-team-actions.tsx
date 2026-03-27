"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

const PLACEHOLDER_ACTIONS = ["Promote", "Demote", "Clear Inactivity", "More Soon"];

export function AdminTeamActions({
  teamId,
  teamName,
  deleteEnabled,
  deleteDisabledReason
}: {
  teamId: string;
  teamName: string;
  deleteEnabled: boolean;
  deleteDisabledReason?: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<string | null>(deleteDisabledReason ?? null);
  const [statusIsError, setStatusIsError] = useState(Boolean(deleteDisabledReason));

  async function handleDelete() {
    if (!deleteEnabled || pending) {
      if (deleteDisabledReason) {
        setStatus(deleteDisabledReason);
        setStatusIsError(true);
      }
      return;
    }

    const confirmed = window.confirm(
      `Delete ${teamName} permanently? This removes the team and linked team data and cannot be undone.`
    );
    if (!confirmed) {
      return;
    }

    setPending(true);
    setStatus(null);
    setStatusIsError(false);

    try {
      const response = await fetch("/api/teams/delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ teamId })
      });
      const payload = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        message?: string;
      };

      if (!response.ok || payload.ok === false) {
        setStatus(payload.message ?? "Could not delete the team.");
        setStatusIsError(true);
        return;
      }

      router.push(`/?teamDeleted=${encodeURIComponent(teamName)}`);
      router.refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not delete the team.");
      setStatusIsError(true);
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="dash-card full-span admin-actions-card">
      <div className="dash-card-head">
        <div className="dash-card-title">
          <span>Admin</span> Team Actions
        </div>
        <Link href="/" className="inline-link-button">
          Back to Tier List
        </Link>
      </div>
      <div className="admin-actions-grid">
        <button className="btn-reject" type="button" onClick={handleDelete} disabled={!deleteEnabled || pending}>
          {pending ? "Deleting..." : "Delete Team"}
        </button>
        {PLACEHOLDER_ACTIONS.map((label) => (
          <button key={label} className="p-action p-review" type="button" disabled title="Coming soon">
            {label}
          </button>
        ))}
      </div>
      {status ? (
        <div className="inline-status" style={statusIsError ? { color: "var(--red, #ef4444)" } : undefined}>
          {status}
        </div>
      ) : null}
      <div className="note-copy">
        Delete permanently removes the team and linked team records. Placeholder actions are visible for future admin tools.
      </div>
    </section>
  );
}
