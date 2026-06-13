"use client";

import { useRef, useState } from "react";
import { authClient } from "@/src/lib/auth-client";

type Mode = "login" | "signup";

type FormEventLike = {
  preventDefault(): void;
  currentTarget: HTMLFormElement;
};

export function LoginForm({ redirect }: { redirect: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(form: HTMLFormElement, mode: Mode) {
    setError("");
    setPending(true);

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

    setPending(false);

    if (result.error) {
      setError(result.error.message ?? "Authentication failed");
      return;
    }

    window.location.assign(result.data?.url ?? redirect);
  }

  function onSubmit(event: FormEventLike) {
    event.preventDefault();
    void submit(event.currentTarget, "login");
  }

  function onSignUp() {
    if (!formRef.current) return;
    void submit(formRef.current, "signup");
  }

  return (
    <form ref={formRef} onSubmit={onSubmit}>
      <input type="hidden" name="redirect" value={redirect} />
      <p>
        <label>
          Email
          <input name="email" type="email" required />
        </label>
      </p>
      <p>
        <label>
          Password
          <input name="password" type="password" required />
        </label>
      </p>
      {error ? <p role="alert">{error}</p> : null}
      <button type="submit" disabled={pending}>
        Login
      </button>
      <button type="button" value="signup" disabled={pending} onClick={onSignUp}>
        Sign up
      </button>
    </form>
  );
}
