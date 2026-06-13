// Guards Component ① (the agent setup runbook) against drift and clobbering.
// Run: node scripts/verify-runbook.mjs   (or `pnpm verify:runbook`)
// No deps — same style as scripts/verify-versions.mjs / verify-forbidden.mjs.
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");
let failed = false;
const fail = (msg) => { console.error(`✗ ${msg}`); failed = true; };
const ok = (msg) => console.log(`✓ ${msg}`);

// 1. SETUP.md must exist at repo root.
if (!existsSync(join(root, "SETUP.md"))) {
  console.error("✗ SETUP.md not found at repo root");
  console.error("\nRunbook verification FAILED.");
  process.exit(1);
}
const setup = read("SETUP.md");
ok("SETUP.md exists");

// 2. All 8 numbered steps present.
for (let n = 1; n <= 8; n++) {
  if (!new RegExp(`##\\s*Step ${n}\\b`).test(setup)) fail(`SETUP.md missing "## Step ${n}" heading`);
}

// 3. CLI injection contract: the project-name token must be present (Plan 2 replaces it).
if (!setup.includes("{{PROJECT_NAME}}")) fail("SETUP.md missing {{PROJECT_NAME}} token (CLI injection contract)");

// 4. The Convex-login step must be marked HUMAN-ONLY (agent must stop, not fabricate).
if (!setup.includes("HUMAN-ONLY")) fail("SETUP.md missing a HUMAN-ONLY gate marker");

// 5. Convex deployment env keys must be documented...
const convexEnvKeys = ["BETTER_AUTH_SECRET", "SITE_URL", "COOKIE_DOMAIN", "TRUSTED_ORIGINS"];
for (const k of convexEnvKeys) {
  if (!setup.includes(k)) fail(`SETUP.md missing Convex env key "${k}"`);
}
// ...and the 3 config keys must still be the ones convex/auth.ts actually reads (drift guard).
const authTs = read("packages/backend/convex/auth.ts");
for (const k of ["SITE_URL", "COOKIE_DOMAIN", "TRUSTED_ORIGINS"]) {
  if (!authTs.includes(k)) fail(`convex/auth.ts no longer reads "${k}" — SETUP.md Step 5 is stale`);
}

// 6. G3 smoke test must be referenced.
if (!setup.includes("poc-verification.md")) fail("SETUP.md should reference docs/poc-verification.md (G3 smoke test)");

// 7. AGENTS.md / CLAUDE.md: preserve the Convex auto-block AND carry the pointer.
for (const f of ["AGENTS.md", "CLAUDE.md"]) {
  const c = read(f);
  if (!c.includes("convex-ai-start")) fail(`${f} lost its <!-- convex-ai-start --> block (append, do not overwrite)`);
  if (!/##\s*First-time setup/.test(c)) fail(`${f} missing "## First-time setup" pointer section`);
  if (!c.includes("SETUP.md")) fail(`${f} pointer must reference SETUP.md`);
}

if (failed) {
  console.error("\nRunbook verification FAILED.");
  process.exit(1);
}
console.log("\n✓ Runbook verification passed.");
