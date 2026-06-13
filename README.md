> 📖 **English** · [한국어](README.ko.md)

# SSO Kit

A public starter kit for **subdomain single sign-on** — log in once at
`auth.example.com`, and stay logged in across `chat.example.com`,
`notes.example.com`, and every other app under the same root domain.

Built on **[Next.js 15](https://nextjs.org) + [Convex](https://convex.dev) +
[Better Auth](https://better-auth.com)**. There is **no hand-written auth
server, no `/sessions` phone-home API, and no Redis** — a single Convex
deployment is the central session store, Better Auth's `crossSubDomainCookies`
handles cookie sharing, and a tiny Next.js proxy route in each app keeps cookies
first-party. (Why this design instead of building your own auth service?
See [`docs/architecture-decision.md`](docs/architecture-decision.md).)

```
                              [browser]
                  session cookie  ·  Domain=example.com
            ┌───────────────────┼───────────────────┐
            ▼                   ▼                   ▼
    auth.example.com     chat.example.com    notes.example.com
     (apps/auth)          (apps/chat)         (your app)
     login portal         demo consumer       …
     /api/auth/* ─┐        /api/auth/* ─┐      /api/auth/* ─┐
                  │   each app proxies its OWN /api/auth (first-party, no CORS)
                  ▼                   ▼                   ▼
            ┌─────────────────────────────────────────────────┐
            │   single Convex deployment  (packages/backend)   │
            │   @convex-dev/better-auth · users · sessions     │
            └─────────────────────────────────────────────────┘
```

---

## The lvh.me rule (read this first)

**Local development uses `lvh.me`, not `*.localhost`.**

`lvh.me` is a public DNS name that resolves to `127.0.0.1`, so `auth.lvh.me` and
`chat.lvh.me` are real subdomains of a shared parent (`lvh.me`) with **no
`/etc/hosts` editing required**.

`*.localhost` looks like it should work, but **Chrome does not share cookies
across `*.localhost` subdomains** — you log in and immediately bounce back to the
login page. This was verified in a real browser (see
[`docs/poc-verification.md`](docs/poc-verification.md)). Use `lvh.me`.

| Local dev | Works? |
|---|---|
| `auth.lvh.me:3000` / `chat.lvh.me:3001`, `COOKIE_DOMAIN=lvh.me` | ✅ |
| `auth.localhost:3000` / `chat.localhost:3001`, `COOKIE_DOMAIN=localhost` | ❌ Chrome won't share the cookie |

---

## Quick start

> 🤖 **Using an AI coding agent?** It can run this setup for you — point it at
> [`SETUP.md`](SETUP.md) (Claude/Codex read it automatically on first open).

**Prerequisites:** Node 18+, [pnpm](https://pnpm.io) 10 (this repo pins
`pnpm@10.33.0`), and a free [Convex](https://convex.dev) account.

### 1. Install

```bash
pnpm install
```

### 2. Connect a Convex deployment

```bash
cd packages/backend
npx convex dev          # first run: log in + create/select a project
```

The first run logs you into Convex, provisions a deployment, and writes
`packages/backend/.env.local` (your `CONVEX_DEPLOYMENT` / URLs). **Leave it
running** — it pushes the auth functions and watches for changes.

### 3. Set the Convex deployment's environment variables

Better Auth runs *inside* Convex, so these live on the deployment (not in a
`.env.local`). Run from `packages/backend/`:

```bash
npx convex env set BETTER_AUTH_SECRET "$(openssl rand -base64 32)"
npx convex env set SITE_URL          http://auth.lvh.me:3000
npx convex env set COOKIE_DOMAIN     lvh.me
npx convex env set TRUSTED_ORIGINS   http://auth.lvh.me:3000,http://chat.lvh.me:3001
```

(Or set them in the Convex dashboard → Settings → Environment Variables.)

### 4. Create each app's `.env.local`

```bash
cp apps/auth/.env.example apps/auth/.env.local
cp apps/chat/.env.example apps/chat/.env.local
```

Then edit both files and replace `YOUR-DEPLOYMENT` with your Convex deployment's
subdomain (the part before `.convex.cloud`, shown by `npx convex dev`).

### 5. Run the apps

Three terminals (keep `convex dev` from step 2 running as the third):

```bash
pnpm dev:auth     # → http://auth.lvh.me:3000   (login portal)
pnpm dev:chat     # → http://chat.lvh.me:3001   (demo consumer app)
```

### 6. Try it

1. Open **http://chat.lvh.me:3001/protected** → you're redirected to
   `auth.lvh.me:3000/login?redirect=…` (unauthenticated guard).
2. **Sign up** with any email/password.
3. You land back on the protected page, now showing your email — and
   `auth.lvh.me:3000/login` also recognizes you. One session, both subdomains.
4. Click **Logout** → both apps drop you immediately.

That's G1–G4 (cross-subdomain session, central logout, redirect guard, cookie
domain) — the gates documented in [`docs/poc-verification.md`](docs/poc-verification.md).

---

## Repo structure

```
sso-kit/
├── apps/
│   ├── auth/        # login portal (auth.lvh.me) — has /login, no route guard
│   │   ├── app/
│   │   │   ├── api/auth/[...all]/route.ts   # proxy → shared Convex (Better Auth handler)
│   │   │   ├── login/page.tsx               # server: reads session, renders form or "signed in"
│   │   │   └── login/login-form.tsx         # client: authClient.signUp / signIn
│   │   └── src/lib/{auth-client,auth-server}.ts
│   └── chat/        # demo consumer app (chat.lvh.me) — guards /protected
│       ├── app/
│       │   ├── api/auth/[...all]/route.ts   # proxy → shared Convex
│       │   └── protected/page.tsx           # server-rendered, requires a session
│       ├── middleware.ts                    # redirects unauthenticated /protected → auth portal
│       └── src/lib/{auth-client,auth-server}.ts
├── packages/
│   └── backend/     # the single shared Convex deployment
│       └── convex/
│           ├── convex.config.ts   # registers the @convex-dev/better-auth component
│           ├── auth.ts            # createAuth(): crossSubDomainCookies + trustedOrigins
│           ├── auth.config.ts
│           └── http.ts            # mounts Better Auth's HTTP routes
├── docs/            # architecture decision, verification report, diagram (HTML)
└── scripts/         # static checks + browser gate scripts (see "Verification")
```

> `packages/types-node` and `packages/types-react` are temporary type stubs and
> are scheduled for removal — see [Project status](#project-status).

---

## Adding a new app (3 steps)

Always copy **`apps/chat`** (the consumer template), not `apps/auth`. Say you
want `notes.lvh.me:3002`:

**1. Copy and rename.**

```bash
cp -r apps/chat apps/notes
```

Edit `apps/notes/package.json`: set `"name": "@sso-kit/notes"` and change the
dev port: `"dev": "next dev -H 0.0.0.0 -p 3002"`.

**2. Configure its env.**

```bash
cp apps/notes/.env.example apps/notes/.env.local
```

Point `CHAT_ORIGIN` (this app's own origin) at `http://notes.lvh.me:3002`, keep
`NEXT_PUBLIC_AUTH_ORIGIN` pointing at the auth portal, and keep
`COOKIE_DOMAIN=lvh.me`. The proxy route (`app/api/auth/[...all]/route.ts`), the
`/protected` guard (`middleware.ts`), and the same-origin auth client come along
in the copy — adjust the `middleware.ts` `matcher` for whatever routes you want
to protect.

**3. Trust the new origin.**

Add it to the Convex deployment's trusted origins, then start it:

```bash
cd packages/backend
npx convex env set TRUSTED_ORIGINS \
  http://auth.lvh.me:3000,http://chat.lvh.me:3001,http://notes.lvh.me:3002

pnpm install                 # if the copy added/changed workspace deps
pnpm --filter @sso-kit/notes dev
```

---

## The one rule you can't break: same-origin auth client

**Each app's `authClient` must call its OWN `/api/auth` proxy (same-origin).**
That's why `src/lib/auth-client.ts` leaves `baseURL` unset:

```ts
// apps/chat/src/lib/auth-client.ts — copy this pattern in every app
export const authClient = createAuthClient({
  plugins: [convexClient()],   // no baseURL → calls this app's own /api/auth
});
```

If you point an app's client at the auth origin instead
(`baseURL: "http://auth.lvh.me:3000"`), the browser issues a cross-origin
request and the **CORS preflight is blocked**. The proxy route forwards to the
shared Convex deployment server-side, so cookies stay first-party and there's no
CORS in the first place.

---

## Environment variables

**Per app** — `apps/<app>/.env.local` (template: `.env.example`):

| Variable | Example | Notes |
|---|---|---|
| `NEXT_PUBLIC_CONVEX_URL` | `https://your-deployment.convex.cloud` | Shared Convex deployment |
| `NEXT_PUBLIC_CONVEX_SITE_URL` | `https://your-deployment.convex.site` | Convex HTTP-action host (Better Auth routes) |
| `NEXT_PUBLIC_AUTH_ORIGIN` | `http://auth.lvh.me:3000` | Central login portal |
| `AUTH_ORIGIN` | `http://auth.lvh.me:3000` | Server-side copy of the above |
| `CHAT_ORIGIN` | `http://chat.lvh.me:3001` | This app's own public origin |
| `COOKIE_DOMAIN` | `lvh.me` | Shared parent domain — **lvh.me locally** |

**On the Convex deployment** — set with `npx convex env set` (Better Auth reads
these inside `packages/backend/convex/auth.ts`):

| Variable | Example | Notes |
|---|---|---|
| `BETTER_AUTH_SECRET` | `openssl rand -base64 32` | Required signing secret |
| `SITE_URL` | `http://auth.lvh.me:3000` | Better Auth `baseURL` (the auth portal) |
| `COOKIE_DOMAIN` | `lvh.me` | `crossSubDomainCookies.domain` |
| `TRUSTED_ORIGINS` | `http://auth.lvh.me:3000,http://chat.lvh.me:3001` | Comma-separated; every app's origin |

---

## Zero-dependency demo (optional)

To see the SSO cookie/redirect mechanics **without** installing Convex or
signing in anywhere, the kit ships a hand-rolled mock harness (plain Node HTTP
servers, in-memory users). It's a teaching/testing fixture, **not** the real
app runtime:

```bash
pnpm demo:backend   # mock central session store on :3999
pnpm demo:auth      # mock login portal on auth.lvh.me:3000
pnpm demo:chat      # mock consumer app on chat.lvh.me:3001
```

For anything real, use `pnpm dev:*` (the Next.js + Convex stack above).

---

## Troubleshooting

Real bugs hit during verification — they recur easily, so they're documented here.

- **Redirect target becomes `http://0.0.0.0:3001/...`.** `next dev -H 0.0.0.0`
  makes `request.url`'s host `0.0.0.0`. Derive the public URL from the `Host`
  header or an env var, never from `request.url`. (Handled in
  `apps/chat/middleware.ts` and the login page's redirect guard.)

- **`/login` returns 500 before you've logged in.** The Convex `getCurrentUser`
  query must be null-safe for anonymous visitors. (Handled via
  `authComponent.safeGetAuthUser(ctx) ?? null` in
  `packages/backend/convex/auth.ts`.)

- **`signIn` / `signOut` fails with a CORS error.** The app's `authClient` is
  calling a different origin. Leave `baseURL` unset so it hits its own
  `/api/auth` — see [the same-origin rule](#the-one-rule-you-cant-break-same-origin-auth-client).

- **Next.js chunk 404 / hydration failure after adding a package.** Re-run
  `pnpm install`, and if it persists delete the app's `.next/` and restart.

- **You log in but bounce back to the login page.** You're on `*.localhost`.
  Switch to `lvh.me` — see [The lvh.me rule](#the-lvhme-rule-read-this-first).

---

## Production deployment

Deploy each app as its own project (e.g. Vercel) on a subdomain of one shared
root domain, point `npx convex deploy` at a production deployment, and set
`COOKIE_DOMAIN` / `crossSubDomainCookies.domain` to that root domain. Over HTTPS
the session cookie picks up the `Secure` attribute, so re-run the G1–G4 checks
against the real domains. Full host-setup, DNS, and security-hardening notes are
in [`docs/poc-verification.md`](docs/poc-verification.md). Cross-**root**-domain
SSO is explicitly out of scope for v1 (see the ADR roadmap).

---

## Verification

- Architecture flow gates **G1–G4** were verified manually in Chrome against the
  live Convex + Better Auth stack — details and evidence in
  [`docs/poc-verification.md`](docs/poc-verification.md).
- `scripts/browser-gates.mjs` (mock harness) and
  `scripts/browser-gates-realstack.mjs` (real stack) drive the gates with a
  headless Chrome via CDP. The real-stack script is **not yet stable for CI** —
  manual verification is the current source of truth.
- Repo guards: `pnpm verify:versions` (pins `@convex-dev/better-auth` 0.12.x /
  `better-auth` ~1.6 / `convex` ^1.25+) and `pnpm verify:forbidden` (bans the
  rejected `@better-auth/sso` and `oidcProvider` plugins — see the ADR).

---

## Project status

This is a working proof-of-concept kit; a few things are deliberately unfinished:

- **Type stubs.** `packages/types-node` / `packages/types-react` are placeholder
  stubs (a sandbox workaround). They need to be replaced with real `@types/*`
  devDependencies, after which `next.config.mjs`'s `ignoreBuildErrors` /
  `ignoreDuringBuilds` can be removed and `tsc --noEmit` + `next build` become
  the real build gate. Until then, `pnpm build` / `pnpm typecheck` only run a
  structural check (`scripts/static-check.mjs`).
- **Gate automation.** `scripts/browser-gates-realstack.mjs` is flaky; gates are
  verified manually for now.
- **License.** Not yet specified — add a `LICENSE` before publishing.

---

## Docs

- [`docs/architecture-decision.md`](docs/architecture-decision.md) — ADR-0001: why this design, and the alternatives that were rejected.
- [`docs/poc-verification.md`](docs/poc-verification.md) — G1–G4 verification report and the lvh.me finding.
- [`docs/architecture-diagram.html`](docs/architecture-diagram.html) — interactive flow diagram (open in a browser).
