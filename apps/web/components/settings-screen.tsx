"use client";

import { useRef } from "react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import type { AdminAccount, SettingsRecord } from "@rematch/shared-types";

export function SettingsScreen({
  settings,
  admins,
  viewer
}: {
  settings: SettingsRecord;
  admins: AdminAccount[];
  viewer: AdminAccount;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<string | null>(null);
  const [discordChannelId, setDiscordChannelId] = useState(settings.discordChannelId ?? "");
  const [pinnedMessageId, setPinnedMessageId] = useState(settings.pinnedMessageId ?? "");
  const [newAdminUsername, setNewAdminUsername] = useState("");
  const [newAdminDisplayName, setNewAdminDisplayName] = useState("");
  const [newAdminPassword, setNewAdminPassword] = useState("");
  const [newAdminRole, setNewAdminRole] = useState<"super_admin" | "admin">("admin");
  const isSuperAdmin = viewer.role === "super_admin";
  const publicPdfInputRef = useRef<HTMLInputElement>(null);
  const adminPdfInputRef = useRef<HTMLInputElement>(null);

  async function handleUploadPdf(type: "public" | "admin", inputRef: React.RefObject<HTMLInputElement | null>) {
    const file = inputRef.current?.files?.[0];
    if (!file) return;

    const hasExisting = type === "public" ? Boolean(settings.publicRulesetPdfPath) : Boolean(settings.adminRulesetPdfPath);
    if (hasExisting) {
      const confirmed = window.confirm("A PDF is already uploaded. Replace it with the new file?");
      if (!confirmed) {
        if (inputRef.current) inputRef.current.value = "";
        return;
      }
    }

    const formData = new FormData();
    formData.append("type", type);
    formData.append("file", file);

    const response = await fetch("/api/admin/ruleset-pdf", {
      method: "POST",
      body: formData
    });
    const payload = (await response.json()) as { message?: string };
    setStatus(payload.message ?? "Upload completed.");
    if (inputRef.current) inputRef.current.value = "";
    if (response.ok) {
      router.refresh();
    }
  }

  async function handleTestDiscord() {
    await runDiscordAction("test");
  }

  async function handleResyncDiscordSummary() {
    await runDiscordAction("summary");
  }

  async function runDiscordAction(mode: "summary" | "test") {
    const response = await fetch("/api/discord/resync", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ mode })
    });
    const payload = (await response.json()) as { message?: string };
    setStatus(payload.message ?? "Discord sync completed.");
  }

  async function handleSaveSettings() {
    const response = await fetch("/api/settings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        discordChannelId,
        pinnedMessageId
      })
    });
    const payload = (await response.json()) as { message?: string };
    setStatus(payload.message ?? "Settings save completed.");
    if (response.ok) {
      router.refresh();
    }
  }

  async function handleCreateAdmin() {
    const response = await fetch("/api/admin/accounts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        action: "create",
        username: newAdminUsername,
        displayName: newAdminDisplayName,
        role: newAdminRole,
        password: newAdminPassword
      })
    });
    const payload = (await response.json()) as { message?: string };
    setStatus(payload.message ?? "Admin action completed.");

    if (response.ok) {
      setNewAdminUsername("");
      setNewAdminDisplayName("");
      setNewAdminPassword("");
      setNewAdminRole("admin");
      router.refresh();
    }
  }

  async function handleResetPassword(admin: AdminAccount) {
    const password = window.prompt(`Enter a new password for ${admin.displayName}:`, "");
    if (!password) {
      return;
    }

    const response = await fetch("/api/admin/accounts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        action: "reset_password",
        adminId: admin.id,
        password
      })
    });
    const payload = (await response.json()) as { message?: string };
    setStatus(payload.message ?? "Password reset completed.");
  }

  async function handleRemoveAdmin(admin: AdminAccount) {
    const shouldRemove = window.confirm(`Remove ${admin.displayName}? This will delete their admin login.`);
    if (!shouldRemove) {
      return;
    }

    const response = await fetch("/api/admin/accounts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        action: "delete",
        adminId: admin.id
      })
    });
    const payload = (await response.json()) as { message?: string };
    setStatus(payload.message ?? "Admin removal completed.");

    if (response.ok) {
      router.refresh();
    }
  }

  return (
    <div className="page">
      <div className="page-title">Admin Settings · start.gg + Discord + Admin Management</div>
      <div className="settings-grid">
        <section className="dash-card">
          <div className="dash-card-title">
            <span>🔑</span> API Keys
          </div>
          <div className="settings-row">
            <div>
              <div className="p-name">start.gg API Key</div>
              <div className="p-reason">{settings.startGgApiKeySet ? "Configured" : "Not set yet"}</div>
            </div>
            <button className="p-action p-review">Manage</button>
          </div>
          <div className="settings-row">
            <div>
              <div className="p-name">Discord Sync</div>
              <div className="p-reason">{settings.discordConfigured ? "Configured" : "Not set yet"}</div>
            </div>
            <div className="inline-actions">
              <button className="p-action p-review" onClick={handleTestDiscord}>
                Test
              </button>
              <button className="p-action p-review" onClick={handleResyncDiscordSummary}>
                Resync Summary
              </button>
            </div>
          </div>
          <div className="form-stack settings-form-block">
            <span className="form-label">Discord Channel ID</span>
            <input
              className="form-input"
              value={discordChannelId}
              onChange={(event) => setDiscordChannelId(event.target.value)}
              placeholder="Paste target channel id"
            />
          </div>
          <div className="form-stack settings-form-block">
            <span className="form-label">Pinned Message ID</span>
            <input
              className="form-input"
              value={pinnedMessageId}
              onChange={(event) => setPinnedMessageId(event.target.value)}
              placeholder="Leave blank to let the bot create and pin one"
            />
          </div>
          <div className="callout compact-callout">
            Discord bot token and other secrets should stay in environment variables for now, not in the admin UI. If this field is blank,
            the next summary sync will create and pin the bot&apos;s own message automatically.
          </div>
        </section>

        <section className="dash-card">
          <div className="dash-card-title">
            <span>👥</span> Admin Accounts
          </div>
          <div className="p-reason">Signed in as {viewer.displayName}</div>
          {admins.map((admin) => (
            <div key={admin.id} className="pending-item">
              <div className="p-avatar">{admin.username.slice(0, 2).toUpperCase()}</div>
              <div className="p-info">
                <div className="p-name">{admin.displayName}</div>
                <div className="p-reason">{admin.role.replace("_", " ")}</div>
              </div>
              {isSuperAdmin ? (
                <div className="inline-actions">
                  <button className="p-action p-review" onClick={() => handleResetPassword(admin)}>
                    Reset Password
                  </button>
                  {admin.id !== viewer.id ? (
                    <button className="p-action p-down" onClick={() => handleRemoveAdmin(admin)}>
                      Remove
                    </button>
                  ) : null}
                </div>
              ) : (
                <div className="p-reason">Super admin only</div>
              )}
            </div>
          ))}
          {isSuperAdmin ? (
            <>
              <div className="form-stack settings-form-block">
                <span className="form-label">New Admin Username</span>
                <input
                  className="form-input"
                  value={newAdminUsername}
                  onChange={(event) => setNewAdminUsername(event.target.value)}
                  placeholder="for example: bracketops"
                />
              </div>
              <div className="form-stack settings-form-block">
                <span className="form-label">Display Name</span>
                <input
                  className="form-input"
                  value={newAdminDisplayName}
                  onChange={(event) => setNewAdminDisplayName(event.target.value)}
                  placeholder="Bracket Ops"
                />
              </div>
              <div className="form-stack settings-form-block">
                <span className="form-label">Temporary Password</span>
                <input
                  className="form-input"
                  type="password"
                  value={newAdminPassword}
                  onChange={(event) => setNewAdminPassword(event.target.value)}
                  placeholder="At least 8 characters"
                />
              </div>
              <div className="form-stack settings-form-block">
                <span className="form-label">Role</span>
                <select
                  className="form-input"
                  value={newAdminRole}
                  onChange={(event) =>
                    setNewAdminRole(event.target.value === "super_admin" ? "super_admin" : "admin")
                  }
                >
                  <option value="admin">Admin</option>
                  <option value="super_admin">Super Admin</option>
                </select>
              </div>
              <button className="btn-login" type="button" onClick={handleCreateAdmin}>
                Create Admin
              </button>
            </>
          ) : (
            <div className="callout compact-callout">
              Super admins can create admins, reset passwords, and remove accounts from this screen.
            </div>
          )}
        </section>
        {isSuperAdmin ? (
          <section className="dash-card">
            <div className="dash-card-title">
              <span>📜</span> Public Ruleset PDF
            </div>
            <div className="settings-row">
              <div>
                <div className="p-name">Public Ruleset</div>
                <div className="p-reason">
                  {settings.publicRulesetPdfPath ? "PDF uploaded" : "No PDF uploaded"}
                </div>
              </div>
              <button className="p-action p-review" onClick={() => publicPdfInputRef.current?.click()}>
                {settings.publicRulesetPdfPath ? "Replace PDF" : "Upload PDF"}
              </button>
            </div>
            <input
              ref={publicPdfInputRef}
              type="file"
              accept=".pdf,application/pdf"
              style={{ display: "none" }}
              onChange={() => handleUploadPdf("public", publicPdfInputRef)}
            />
            <div className="callout compact-callout">
              Visible to all users in the nav bar. Uploading replaces the existing PDF.
            </div>
          </section>
        ) : null}

        {isSuperAdmin ? (
          <section className="dash-card">
            <div className="dash-card-title">
              <span>📋</span> Admin Ruleset PDF
            </div>
            <div className="settings-row">
              <div>
                <div className="p-name">Admin Ruleset</div>
                <div className="p-reason">
                  {settings.adminRulesetPdfPath ? "PDF uploaded" : "No PDF uploaded"}
                </div>
              </div>
              <button className="p-action p-review" onClick={() => adminPdfInputRef.current?.click()}>
                {settings.adminRulesetPdfPath ? "Replace PDF" : "Upload PDF"}
              </button>
            </div>
            <input
              ref={adminPdfInputRef}
              type="file"
              accept=".pdf,application/pdf"
              style={{ display: "none" }}
              onChange={() => handleUploadPdf("admin", adminPdfInputRef)}
            />
            <div className="callout compact-callout">
              Only visible to admins. Uploading replaces the existing PDF.
            </div>
          </section>
        ) : null}
      </div>
      <div className="inline-actions">
        <button className="btn-login" type="button" onClick={handleSaveSettings}>
          Save Settings
        </button>
      </div>
      {status ? <div className="inline-status">{status}</div> : null}
    </div>
  );
}
