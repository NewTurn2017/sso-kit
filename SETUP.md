# First-time setup — {{PROJECT_NAME}}

> **You are an AI coding agent (Claude Code / Codex / etc.).** This runbook walks
> a human through configuring this SSO Kit project for the first time. Do every
> step you can do yourself; **stop and ask the human** at the steps marked
> **🚦 HUMAN-ONLY** (the Convex login in Step 3, the dev-domain choice in Step 4).
> Narrate each step as you go. **Never fabricate a Convex deployment URL** — wait
> for the human to paste the real one.
>
> If `apps/*/.env.local` already exist, this project is probably already set up —
> confirm with the human before re-running anything.
>
> If you see `{{PROJECT_NAME}}` literally below, this repo was cloned directly (not
> scaffolded via `create-sso-kit`) — use the repo's own name (or ask the user)
> wherever it appears; don't narrate the literal token.
>
> These commands mirror the README "Quick start"; keep the two in sync.
>
> Communicate with the human in **their** language — if they write to you in Korean, guide them in Korean. Keep all commands, env var names, URLs, and file paths byte-for-byte as written (do not translate those).

## Prerequisites

Node 18+, [pnpm](https://pnpm.io) 10 (this repo pins `pnpm@10.33.0`), and a free
[Convex](https://convex.dev) account.

## Step 1 — Greet & orient

Tell the human: "I'll set up **{{PROJECT_NAME}}** step by step. Two steps need you
(a browser login and a domain choice) — I'll pause and ask when I reach them.
Ready to start?"

## Step 2 — Install dependencies

Run:

```bash
pnpm install
```

Confirm it finishes without errors before continuing.

## Step 3 — 🚦 HUMAN-ONLY: connect a Convex deployment

You cannot do this part — it opens a browser to log in and asks the human to pick or create a project. Ask the human to run it, and to leave it running:

```bash
cd packages/backend
npx convex dev          # first run: log in + create/select a project
```

Tell them: "Log in when the browser opens and pick (or create) a project, then leave this running — it pushes the auth functions and watches for changes. Tell me once it's connected."

Then **read the deployment values yourself** — `npx convex dev` writes them into `packages/backend/.env.local`, so you do **not** need the human to copy or paste any URL:

- `CONVEX_URL` — e.g. `https://YOUR-DEPLOYMENT.convex.cloud`
- `CONVEX_SITE_URL` — e.g. `https://YOUR-DEPLOYMENT.convex.site`

Wait until `packages/backend/.env.local` exists and contains those keys (that means the login + project step finished). **Never fabricate a deployment URL** — if the file isn't there yet, ask the human to finish the Convex login. You'll reuse `CONVEX_URL` and `CONVEX_SITE_URL` in Step 6.

> ⚠️ Any Convex deployment name you may see in `docs/` (e.g. in `docs/poc-verification.md`) is historical evidence from the kit author — never reuse it. The human creates/selects their own deployment here.

## Step 4 — 🚦 HUMAN-ONLY decision: dev domain

Explain, then propose the default:

> Local dev uses **`lvh.me`** — a public DNS name that resolves to `127.0.0.1`, so
> `auth.lvh.me` / `chat.lvh.me` are real subdomains of a shared parent with no
> `/etc/hosts` editing. Do **not** use `*.localhost`: Chrome does not share cookies
> across `*.localhost` subdomains, so SSO silently bounces you back to login.

Ask: "Use the default **`lvh.me`** (recommended), or a custom shared parent
domain?" Record the answer as `<DOMAIN>` (default `lvh.me`) and derive:

- auth origin = `http://auth.<DOMAIN>:3000`
- chat origin = `http://chat.<DOMAIN>:3001`

## Step 5 — Set the Convex deployment env vars

Better Auth runs *inside* Convex, so these live on the deployment (not in a
`.env.local`). **Requires Step 3 to be finished** (the human's `npx convex dev`
has linked a deployment and is still running). Open a **new terminal** — leave
`convex dev` running — and run these from `packages/backend/`, substituting
`<DOMAIN>` from Step 4:

```bash
npx convex env set BETTER_AUTH_SECRET "$(openssl rand -base64 32)"
npx convex env set SITE_URL          http://auth.<DOMAIN>:3000
npx convex env set COOKIE_DOMAIN     <DOMAIN>
npx convex env set TRUSTED_ORIGINS   http://auth.<DOMAIN>:3000,http://chat.<DOMAIN>:3001
```

With the default, that makes `SITE_URL=http://auth.lvh.me:3000`,
`COOKIE_DOMAIN=lvh.me`, `TRUSTED_ORIGINS=http://auth.lvh.me:3000,http://chat.lvh.me:3001`.
(If `openssl` isn't available, any 32+ character random string works for
`BETTER_AUTH_SECRET`.)

## Step 6 — Write each app's `.env.local`

Copy the examples, then fill in the Convex URL from Step 3:

```bash
cp apps/auth/.env.example apps/auth/.env.local
cp apps/chat/.env.example apps/chat/.env.local
```

In **both** files, set the two Convex URLs to the values you read from
`packages/backend/.env.local` in Step 3:

- `NEXT_PUBLIC_CONVEX_URL` = the `CONVEX_URL` value you read from `packages/backend/.env.local` in Step 3
- `NEXT_PUBLIC_CONVEX_SITE_URL` = the `CONVEX_SITE_URL` value from that same file

**If you kept the default `lvh.me`**, the origin lines are already correct — no
further edits. **If you chose a custom `<DOMAIN>`**, also rewrite all four origin
lines in each file to use it: `NEXT_PUBLIC_AUTH_ORIGIN`, `AUTH_ORIGIN`,
`CHAT_ORIGIN`, and `COOKIE_DOMAIN=<DOMAIN>`.

## Step 7 — Run & verify (G3 smoke test)

Keep `npx convex dev` (Step 3) running. In two more terminals:

```bash
pnpm dev:auth     # → http://auth.<DOMAIN>:3000   (login portal)
pnpm dev:chat     # → http://chat.<DOMAIN>:3001   (demo consumer)
```

Verify the **G3 unauthenticated-redirect** gate (the smoke test recorded in
`docs/poc-verification.md`): with no session, requesting
`http://chat.<DOMAIN>:3001/protected` must redirect to
`http://auth.<DOMAIN>:3000/login?redirect=…`. You can check this headlessly:

```bash
curl -sI http://chat.<DOMAIN>:3001/protected | grep -i '^location:'
```

Expect a `location:` header pointing at `…/login?redirect=…`. The rest of the
flow is browser-interactive — have the human (or a real browser) sign up → land
back on the protected page showing their email, confirm `auth.<DOMAIN>:3000/login`
also recognizes them (one session, both subdomains), and Logout drops both apps.
Report the result to the human.

## Step 8 — (Optional) publish

Offer: "Want this on GitHub? I can run the `make-public` skill (or `make-private`
for a private repo)." Only proceed if the human says yes.
