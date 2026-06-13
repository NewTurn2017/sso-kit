import { makeFunctionReference } from "convex/server";
import { fetchAuthQuery } from "@/src/lib/auth-server";
import { LogoutButton } from "./logout-button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

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
    <main className="grid min-h-dvh place-items-center px-4 py-10">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Protected area</CardTitle>
          <CardDescription>
            You reached this through the shared SSO session, not a login on this app.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-1">
          <span className="text-sm text-muted-foreground">Signed in as</span>
          <span className="font-medium">{email}</span>
        </CardContent>
        <CardFooter>
          <LogoutButton />
        </CardFooter>
      </Card>
    </main>
  );
}
