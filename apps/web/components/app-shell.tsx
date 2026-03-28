import Link from "next/link";
import type { ReactNode } from "react";

import type { AdminAccount } from "@rematch/shared-types";

import { LogoutButton } from "./logout-button";

const navLinks = [
  { href: "/", label: "Tier List", icon: "🏆" },
  { href: "/history", label: "History", icon: "🗓️" },
  { href: "/admin", label: "Admin", icon: "⚙️" },
  { href: "/admin/results", label: "Upload", icon: "📸" },
  { href: "/admin/unverified", label: "Unverified", icon: "🆕" },
  { href: "/admin/login", label: "Login", icon: "🔐" }
];

export function AppShell({
  activePath,
  children,
  viewer
}: {
  activePath: string;
  children: ReactNode;
  viewer?: AdminAccount | null;
}) {
  return (
    <>
      <nav>
        <div className="nav-logo">
          REMATCH <span>TIER</span>
        </div>
        <div className="nav-tabs">
          {navLinks.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-tab ${activePath === item.href ? "active" : ""}`}
            >
              <span>{item.icon}</span> {item.label}
            </Link>
          ))}
          <span
            className={`nav-tab ${activePath.startsWith("/teams/") ? "active" : ""}`}
            style={{ cursor: "default" }}
          >
            <span>👤</span> Team Profile
          </span>
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
