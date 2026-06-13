"use client";

import { useState } from "react";
import { authClient } from "@/src/lib/auth-client";

const authOrigin = process.env.NEXT_PUBLIC_AUTH_ORIGIN ?? "http://auth.lvh.me:3000";

export function LogoutButton() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function onClick() {
    setPending(true);
    setError("");

    const result = await authClient.signOut();
    setPending(false);

    if (result.error) {
      setError(result.error.message ?? "Logout failed");
      return;
    }

    window.location.assign(`${authOrigin}/login`);
  }

  return (
    <>
      {error ? <p role="alert">{error}</p> : null}
      <button
        type="button"
        data-testid="logout-button"
        disabled={pending}
        onClick={onClick}
      >
        Logout
      </button>
    </>
  );
}
