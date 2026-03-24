"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleLogout() {
    setPending(true);

    try {
      await fetch("/api/auth/logout", {
        method: "POST"
      });
    } finally {
      router.push("/admin/login");
      router.refresh();
      setPending(false);
    }
  }

  return (
    <button className="btn-login" type="button" onClick={handleLogout} disabled={pending}>
      {pending ? "Signing Out..." : "Admin Logout"}
    </button>
  );
}
