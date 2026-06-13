import { existsSync, readFileSync } from "node:fs";

const required = [
  "apps/auth/package.json",
  "apps/chat/package.json",
  "packages/backend/package.json",
  "packages/backend/convex/convex.config.ts",
  "packages/backend/convex/auth.config.ts",
  "packages/backend/convex/auth.ts",
  "packages/backend/convex/http.ts",
  "apps/auth/app/api/auth/[...all]/route.ts",
  "apps/chat/app/api/auth/[...all]/route.ts",
];

const missing = required.filter((file) => !existsSync(file));
if (missing.length > 0) {
  console.error(`Missing required files:\n${missing.join("\n")}`);
  process.exit(1);
}

const backendAuth = readFileSync("packages/backend/convex/auth.ts", "utf8");
for (const token of ["crossSubDomainCookies", "trustedOrigins", "emailAndPassword"]) {
  if (!backendAuth.includes(token)) {
    console.error(`Missing Better Auth config token: ${token}`);
    process.exit(1);
  }
}

console.log("Static PoC structure check passed.");
