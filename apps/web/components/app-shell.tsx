import Link from "next/link";
import type { ReactNode } from "react";

import type { AdminAccount } from "@rematch/shared-types";

import { LogoutButton } from "./logout-button";

const navItems = [
  { href: "/", label: "Tier List", icon: "🏆" },
  { href: "/history", label: "History", icon: "🗓️" },
  { href: "/admin", label: "Admin", icon: "⚙️" },
  { href: "/admin/results", label: "Upload", icon: "📸" },
  { href: "/teams/nexforce", label: "Team Profile", icon: "👤" },
  { href: "/admin/unverified", label: "Unverified", icon: "🆕" },
  { href: "/admin/login", label: "Login", icon: "🔐" }
];

export function AppShell({
  activePath,
  children,
  viewer,
  teamProfileHref
}: {
  activePath: string;
  children: ReactNode;
  viewer?: AdminAccount | null;
  teamProfileHref?: string;
}) {
  const resolvedTeamProfileHref = teamProfileHref ?? (viewer ? "/admin/teams/nexforce" : "/teams/nexforce");
  const resolvedNavItems = navItems.map((item) =>
    item.label === "Team Profile" ? { ...item, href: resolvedTeamProfileHref } : item
  );

  return (
    <>
      <nav>
        <div className="nav-logo">
          REMATCH <span>TIER</span>
        </div>
        <div className="nav-tabs">
          {resolvedNavItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-tab ${activePath === item.href ? "active" : ""}`}
            >
              <span>{item.icon}</span> {item.label}
            </Link>
          ))}
        </div>
        <div className="nav-right">
          <div className="live-badge">
            <div className="live-dot" />
            {viewer ? `${viewer.displayName} · ${viewer.role.replace("_", " ")}` : "LIVE"}
          </div>
          {viewer ? (
            <LogoutButton />
          ) : (
            <Link href="/admin/login" className="btn-login">
              Admin Login
            </Link>
          )}
        </div>
      </nav>
      <main>{children}</main>
    </>
  );
}
