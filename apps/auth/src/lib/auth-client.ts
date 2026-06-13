import { convexClient } from "@convex-dev/better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

// Each app talks to its OWN /api/auth proxy (same-origin, no CORS);
// the proxy forwards to the shared Convex deployment.
export const authClient = createAuthClient({
  plugins: [convexClient()],
});
