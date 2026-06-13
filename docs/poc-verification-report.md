# SSO Kit PoC verification report

## Summary

ADR-0001 PoC source and local verification harness are implemented. The active dev domain selected by the executable in-process gate is `lvh.me`, because the first `*.localhost` attempt failed to carry the shared `sso_session` cookie across `auth.localhost:3000` and `chat.localhost:3001`.

This session could not complete the required live Chrome gate. The managed shell and MCP Node runtime both reject local TCP listeners with `EPERM`, and Browser Harness could not attach to Chrome because remote debugging is not enabled for the running Chrome instance. The repository therefore contains the PoC implementation and reproducible local gate scripts, but G4 is blocked in this session.

## Gate status

- G1: Blocked for live browser. Passed in-process with `auth.lvh.me:3000` issuing a central session and `chat.lvh.me:3001` rendering the authenticated email.
- G2: Blocked for live browser. Passed in-process with chat logout deleting the central session and both apps immediately returning unauthenticated responses.
- G3: Blocked for live browser. Passed in-process with unauthenticated chat access redirecting to auth login, signup, and redirect back to the original chat page.
- G4: Failed in this session. Browser Harness reported that Chrome remote debugging must be allowed, and local server startup is blocked by `EPERM`.

## Evidence

- `.omx/artifacts/browser-gates/00-red-chat-dev-before-implementation.txt`: red baseline, chat workspace absent before implementation.
- `.omx/artifacts/browser-gates/01-pnpm-install-lockfile.txt`: package install blocked by `ENOTFOUND registry.npmjs.org`.
- `.omx/artifacts/browser-gates/02-sparkshell-listen-probe.txt`: local TCP listen blocked with `EPERM`.
- `.omx/artifacts/browser-gates/03-browser-harness-doctor.txt`: Browser Harness daemon and active browser connections unavailable.
- `.omx/artifacts/browser-gates/04-browser-harness-connect.txt`: Chrome requires remote-debugging allow flow before Harness can attach.
- `.omx/artifacts/browser-gates/05-inprocess-gates.json`: same handler flow passes G1-G3 with `lvh.me` and fails the first `localhost` cookie-sharing attempt.

## Official-pattern deviations

- The official Convex Better Auth files are present under `packages/backend/convex` and the Next proxy routes are present under both apps.
- Runtime gate execution uses dependency-free Node handlers because package installation is blocked by DNS in this environment. This does not prove the official `@convex-dev/better-auth` runtime path.
- `apps/*/server.mjs` are PoC harness servers, not the final app runtime. They exist to prove the ADR session topology without adding a test framework.

## trustedOrigins and baseURL

- Backend config includes `trustedOrigins` for `auth.localhost:3000`, `chat.localhost:3001`, `auth.lvh.me:3000`, and `chat.lvh.me:3001`.
- Backend config uses `baseURL` from `SITE_URL` or `AUTH_ORIGIN`.
- The selected runnable dev domain is `lvh.me` with `COOKIE_DOMAIN=lvh.me`.

## Remaining risks

- Live Chrome validation remains required outside this sandbox.
- `pnpm install --lockfile-only` must be rerun with registry access to generate a lockfile and verify package peer resolution.
- After install, the official Next/Convex route should be smoke-tested against a real Convex dev deployment.
