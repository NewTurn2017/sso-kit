import { makeFunctionReference } from "convex/server";
import { fetchAuthQuery } from "@/src/lib/auth-server";
import { LogoutButton } from "./logout-button";

type AuthUser = {
  email?: string | null;
} | null;

const getCurrentUser = makeFunctionReference<"query", {}, AuthUser>(
  "auth:getCurrentUser"
);

export default async function ProtectedPage() {
  const user = await fetchAuthQuery(getCurrentUser, {});
  const email = user?.email ?? "unknown";

  return (
    <main>
      <h1>Protected chat</h1>
      <p>{email}</p>
      <LogoutButton />
    </main>
  );
}
