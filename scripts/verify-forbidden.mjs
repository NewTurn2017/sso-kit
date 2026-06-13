import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const roots = ["apps", "packages", "package.json", "pnpm-lock.yaml"];
const forbidden = [/@better-auth\/sso/, /\boidcProvider\b/];
const allowedMissing = new Set(["pnpm-lock.yaml"]);
const hits = [];

function scan(file) {
  const text = readFileSync(file, "utf8");
  for (const pattern of forbidden) {
    if (pattern.test(text)) {
      hits.push(`${file}: ${pattern}`);
    }
  }
}

function walk(path) {
  try {
    const stat = statSync(path);
    if (stat.isDirectory()) {
      for (const entry of readdirSync(path)) {
        if (entry === "node_modules" || entry === ".next") continue;
        walk(join(path, entry));
      }
      return;
    }
    if (/\.(js|mjs|ts|tsx|json|yaml|yml)$/.test(path)) scan(path);
  } catch (error) {
    if (!allowedMissing.has(path)) throw error;
  }
}

for (const root of roots) walk(root);

if (hits.length > 0) {
  console.error(`Forbidden auth plugin references found:\n${hits.join("\n")}`);
  process.exit(1);
}

console.log("Forbidden plugin guard passed.");
