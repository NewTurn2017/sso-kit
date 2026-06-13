import { makeFunctionReference } from "convex/server";
import { fetchAuthQuery } from "@/src/lib/auth-server";
import { LoginForm } from "./login-form";
import { LogoutButton } from "./logout-button";

type SearchParams = {
  redirect?: string | string[];
};

type AuthUser = {
  email?: string | null;
} | null;

const defaultAuthOrigin = "http://auth.lvh.me:3000";
const defaultChatOrigin = "http://chat.lvh.me:3001";

const getCurrentUser = makeFunctionReference<"query", {}, AuthUser>(
  "auth:getCurrentUser"
);

const getOrigin = (value: string | undefined, fallback: string) => {
  if (!value) return fallback;
  return new URL(value).origin;
};

const authOrigin = getOrigin(
  process.env.AUTH_ORIGIN ?? process.env.NEXT_PUBLIC_AUTH_ORIGIN,
  defaultAuthOrigin
);
const chatOrigin = getOrigin(process.env.CHAT_ORIGIN, defaultChatOrigin);

const trustedOrigins = new Set(
  (process.env.TRUSTED_ORIGINS ?? [authOrigin, chatOrigin].join(","))
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
);

function isBindAddressRedirect(target: URL) {
  return target.hostname === "0.0.0.0";
}

function safeRedirect(value: string | string[] | undefined) {
  const fallback = `${chatOrigin}/protected`;
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return fallback;

  try {
    const target = new URL(raw);
    if (isBindAddressRedirect(target)) return fallback;
    if (trustedOrigins.has(target.origin)) return target.toString();
  } catch {
    return fallback;
  }

  return fallback;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const redirect = safeRedirect(params?.redirect);
  const user = await fetchAuthQuery(getCurrentUser, {});

  return (
    <main>
      {user ? (
        <>
          <h1>Authenticated</h1>
          <p>{user.email ?? "unknown"}</p>
          <p>
            <a href={redirect}>Continue</a>
          </p>
          <LogoutButton />
        </>
      ) : (
        <>
          <h1>Login</h1>
          <LoginForm redirect={redirect} />
        </>
      )}
    </main>
  );
}
