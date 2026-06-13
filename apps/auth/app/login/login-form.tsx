"use client";

import { useRef, useState } from "react";
import { authClient } from "@/src/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Mode = "login" | "signup";

export function LoginForm({ redirect }: { redirect: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState<Mode | null>(null);

  async function submit(form: HTMLFormElement, mode: Mode) {
    setError("");
    setPending(mode);

    const data = new FormData(form);
    const email = String(data.get("email") ?? "");
    const password = String(data.get("password") ?? "");

    const result =
      mode === "signup"
        ? await authClient.signUp.email({
            email,
            password,
            name: email,
            callbackURL: redirect,
          })
        : await authClient.signIn.email({
            email,
            password,
            callbackURL: redirect,
          });

    setPending(null);

    if (result.error) {
      setError(result.error.message ?? "Authentication failed");
      return;
    }

    window.location.assign(result.data?.url ?? redirect);
  }

  return (
    <form
      ref={formRef}
      onSubmit={(event) => {
        event.preventDefault();
        void submit(event.currentTarget, "login");
      }}
      className="flex flex-col gap-4"
    >
      <input type="hidden" name="redirect" value={redirect} />

      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          required
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          placeholder="Your password"
          required
        />
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}

      <div className="mt-1 flex flex-col gap-2">
        <Button type="submit" disabled={pending !== null}>
          {pending === "login" ? "Signing in" : "Sign in"}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={pending !== null}
          onClick={() => formRef.current && void submit(formRef.current, "signup")}
        >
          {pending === "signup" ? "Creating account" : "Create account"}
        </Button>
      </div>
    </form>
  );
}
