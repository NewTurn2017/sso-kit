"use client";

import { useState } from "react";
import { authClient } from "@/src/lib/auth-client";
import { Button } from "@/components/ui/button";

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
    <div className="flex w-full flex-col gap-2">
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button
        type="button"
        variant="outline"
        data-testid="logout-button"
        disabled={pending}
        onClick={onClick}
        className="w-full"
      >
        {pending ? "Signing out" : "Log out"}
      </Button>
    </div>
  );
}
