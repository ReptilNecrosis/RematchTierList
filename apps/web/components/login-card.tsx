"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function LoginCard({ needsBootstrap }: { needsBootstrap: boolean }) {
  const router = useRouter();
  const [username, setUsername] = useState("owner");
  const [displayName, setDisplayName] = useState("Owner");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleLogin() {
    setPending(true);

    const endpoint = needsBootstrap ? "/api/auth/bootstrap" : "/api/auth/login";
    const payloadBody = needsBootstrap ? { username, displayName, password } : { username, password };

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payloadBody)
    });
    const payload = (await response.json()) as { ok?: boolean; message?: string };
    setStatus(payload.message ?? "Request complete.");

    if (response.ok && payload.ok) {
      router.push("/admin");
      router.refresh();
    }

    setPending(false);
  }

  return (
    <div className="login-wrap">
      <div className="login-title">{needsBootstrap ? "FIRST SUPER ADMIN" : "ADMIN LOGIN"}</div>
      <div className="login-sub">
        {needsBootstrap
          ? "Create the first super admin account for this Rematch instance"
          : "Rematch Tier List · Restricted Access"}
      </div>
      <label className="form-label">Username</label>
      <input className="form-input" type="text" value={username} onChange={(event) => setUsername(event.target.value)} />
      {needsBootstrap ? (
        <>
          <label className="form-label">Display Name</label>
          <input
            className="form-input"
            type="text"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
          />
        </>
      ) : null}
      <label className="form-label">Password</label>
      <input className="form-input" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
      <button className="btn-primary" type="button" onClick={handleLogin} disabled={pending}>
        {pending ? "Working..." : needsBootstrap ? "Create Super Admin" : "Login"}
      </button>
      <div className="super-badge">
        {needsBootstrap ? (
          <>
            This only appears when there are <span>no admin accounts yet</span>.
          </>
        ) : (
          <>
            Super Admin access: <span>contact owner</span>
          </>
        )}
      </div>
      {status ? <div className="inline-status centered">{status}</div> : null}
    </div>
  );
}
