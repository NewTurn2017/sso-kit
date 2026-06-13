import { readFileSync } from "node:fs";

const backend = JSON.parse(readFileSync("packages/backend/package.json", "utf8"));
const deps = { ...backend.dependencies, ...backend.devDependencies };

const checks = [
  ["@convex-dev/better-auth", /^0\.12\./, deps["@convex-dev/better-auth"]],
  ["better-auth", /^~1\.6\./, deps["better-auth"]],
  ["convex", /^\^1\.(2[5-9]|[3-9][0-9])\./, deps.convex],
];

const failures = checks
  .filter(([, pattern, actual]) => !actual || !pattern.test(actual))
  .map(([name, , actual]) => `${name}: ${actual ?? "missing"}`);

if (failures.length > 0) {
  console.error(`Version guard failed:\n${failures.join("\n")}`);
  process.exit(1);
}

console.log("Version guard passed for @convex-dev/better-auth, better-auth, and convex.");
