"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);

  async function handleLogout() {
    setPending(true);
    setError(false);
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error("Logout failed");
      router.replace("/login");
      router.refresh();
    } catch {
      setError(true);
      setPending(false);
    }
  }

  return (
    <div>
      <button onClick={handleLogout} disabled={pending} className="button">
        {pending ? "Logging out…" : "Log out"}
      </button>
      {error && <p role="alert" className="mt-1 text-sm text-danger">Could not log out. Try again.</p>}
    </div>
  );
}
