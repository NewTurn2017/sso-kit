> 📖 [English](README.md) · **한국어**

# SSO Kit

**서브도메인 싱글 사인온(SSO)** 스타터 킷입니다 — `auth.example.com`에서 한 번
로그인하면 `chat.example.com`, `notes.example.com` 등 같은 루트 도메인 아래의
모든 앱에서 로그인 상태가 유지됩니다.

**[Next.js 15](https://nextjs.org) + [Convex](https://convex.dev) +
[Better Auth](https://better-auth.com)** 기반입니다. **직접 만든 인증 서버도,
`/sessions` phone-home API도, Redis도 없습니다** — 단일 Convex 배포가 중앙 세션
저장소 역할을 하고, Better Auth의 `crossSubDomainCookies`가 쿠키 공유를
처리하며, 각 앱의 작은 Next.js 프록시 라우트가 쿠키를 first-party로 유지합니다.
(직접 인증 서비스를 만드는 대신 왜 이 구조를 택했는지는
[`docs/architecture-decision.md`](docs/architecture-decision.md) 참고.)

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

## lvh.me 규칙 (먼저 읽으세요)

**로컬 개발은 `*.localhost`가 아니라 `lvh.me`를 씁니다.**

`lvh.me`는 `127.0.0.1`로 해석되는 공용 DNS 이름이라, `auth.lvh.me`와
`chat.lvh.me`는 공통 부모(`lvh.me`)를 가진 진짜 서브도메인이 되고 **`/etc/hosts`를
건드릴 필요가 없습니다**.

`*.localhost`는 될 것처럼 보이지만, **Chrome은 `*.localhost` 서브도메인 사이에
쿠키를 공유하지 않습니다** — 로그인하자마자 다시 로그인 페이지로 튕깁니다. 실제
브라우저에서 확인한 내용입니다([`docs/poc-verification.md`](docs/poc-verification.md)
참고). `lvh.me`를 쓰세요.

| 로컬 개발 | 동작? |
|---|---|
| `auth.lvh.me:3000` / `chat.lvh.me:3001`, `COOKIE_DOMAIN=lvh.me` | ✅ |
| `auth.localhost:3000` / `chat.localhost:3001`, `COOKIE_DOMAIN=localhost` | ❌ Chrome가 쿠키를 공유하지 않음 |

---

## 빠른 시작

**사전 준비물:** Node 18+, [pnpm](https://pnpm.io) 10 (이 저장소는
`pnpm@10.33.0` 고정), 그리고 무료 [Convex](https://convex.dev) 계정.

### 1. 설치

```bash
pnpm install
```

### 2. Convex 배포 연결

```bash
cd packages/backend
npx convex dev          # 첫 실행: 로그인 + 프로젝트 생성/선택
```

첫 실행 시 Convex에 로그인하고 배포를 프로비저닝한 뒤
`packages/backend/.env.local`(당신의 `CONVEX_DEPLOYMENT` / URL)을 기록합니다.
**실행 상태로 두세요** — 인증 함수를 푸시하고 변경을 감시합니다.

### 3. Convex 배포의 환경 변수 설정

Better Auth는 Convex *내부*에서 동작하므로, 이 값들은 `.env.local`이 아니라
배포에 설정합니다. `packages/backend/`에서 실행:

```bash
npx convex env set BETTER_AUTH_SECRET "$(openssl rand -base64 32)"
npx convex env set SITE_URL          http://auth.lvh.me:3000
npx convex env set COOKIE_DOMAIN     lvh.me
npx convex env set TRUSTED_ORIGINS   http://auth.lvh.me:3000,http://chat.lvh.me:3001
```

(또는 Convex 대시보드 → Settings → Environment Variables 에서 설정.)

### 4. 각 앱의 `.env.local` 만들기

```bash
cp apps/auth/.env.example apps/auth/.env.local
cp apps/chat/.env.example apps/chat/.env.local
```

그런 다음 두 파일을 열어 `YOUR-DEPLOYMENT`를 당신의 Convex 배포 서브도메인(=
`npx convex dev`가 보여주는 `.convex.cloud` 앞부분)으로 바꿉니다.

### 5. 앱 실행

터미널 3개 (2단계의 `convex dev`를 세 번째로 계속 켜둡니다):

```bash
pnpm dev:auth     # → http://auth.lvh.me:3000   (로그인 포털)
pnpm dev:chat     # → http://chat.lvh.me:3001   (데모 컨슈머 앱)
```

### 6. 동작 확인

1. **http://chat.lvh.me:3001/protected** 열기 → 미인증 가드로
   `auth.lvh.me:3000/login?redirect=…` 로 리다이렉트됨.
2. 아무 이메일/비밀번호로 **회원가입**.
3. 다시 보호 페이지로 돌아오고 이제 내 이메일이 표시됨 — 그리고
   `auth.lvh.me:3000/login`도 나를 인식함. 세션 하나, 두 서브도메인 공유.
4. **로그아웃** 클릭 → 두 앱 모두 즉시 로그아웃됨.

이게 G1~G4(교차 서브도메인 세션, 중앙 로그아웃, 리다이렉트 가드, 쿠키 도메인)이며,
[`docs/poc-verification.md`](docs/poc-verification.md)에 기록된 게이트입니다.

---

## 저장소 구조

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

> `packages/types-node`와 `packages/types-react`는 임시 타입 스텁이며 제거
> 예정입니다 — 아래 "프로젝트 상태" 섹션 참고.

---

## 새 앱 추가 (3단계)

항상 `apps/auth`가 아니라 **`apps/chat`**(컨슈머 템플릿)을 복사하세요.
`notes.lvh.me:3002`를 만든다고 하면:

**1. 복사하고 이름 바꾸기.**

```bash
cp -r apps/chat apps/notes
```

`apps/notes/package.json`에서 `"name": "@sso-kit/notes"`로 바꾸고 dev 포트를
변경: `"dev": "next dev -H 0.0.0.0 -p 3002"`.

**2. env 구성.**

```bash
cp apps/notes/.env.example apps/notes/.env.local
```

`CHAT_ORIGIN`(이 앱 자신의 origin)을 `http://notes.lvh.me:3002`로 두고,
`NEXT_PUBLIC_AUTH_ORIGIN`은 auth 포털을 가리키게 유지하고, `COOKIE_DOMAIN=lvh.me`도
유지합니다. 프록시 라우트(`app/api/auth/[...all]/route.ts`), `/protected`
가드(`middleware.ts`), 같은 출처 auth 클라이언트는 복사본에 그대로 따라옵니다 —
보호할 경로에 맞게 `middleware.ts`의 `matcher`만 조정하세요.

**3. 새 origin 신뢰 등록.**

Convex 배포의 trusted origins에 추가한 뒤 실행:

```bash
cd packages/backend
npx convex env set TRUSTED_ORIGINS \
  http://auth.lvh.me:3000,http://chat.lvh.me:3001,http://notes.lvh.me:3002

pnpm install                 # 복사로 워크스페이스 의존성이 바뀌었다면
pnpm --filter @sso-kit/notes dev
```

---

## 절대 어기면 안 되는 규칙 하나: 같은 출처 auth 클라이언트

**각 앱의 `authClient`는 반드시 자기 자신의 `/api/auth` 프록시(같은 출처)를
호출해야 합니다.** 그래서 `src/lib/auth-client.ts`는 `baseURL`을 비워 둡니다:

```ts
// apps/chat/src/lib/auth-client.ts — 모든 앱에서 이 패턴을 복사하세요
export const authClient = createAuthClient({
  plugins: [convexClient()],   // baseURL 없음 → 이 앱 자신의 /api/auth 호출
});
```

앱의 클라이언트를 auth origin으로 가리키면
(`baseURL: "http://auth.lvh.me:3000"`), 브라우저가 교차 출처 요청을 보내고
**CORS preflight가 차단됩니다**. 프록시 라우트가 서버 쪽에서 공유 Convex 배포로
전달하므로 쿠키는 first-party로 유지되고 애초에 CORS가 발생하지 않습니다.

---

## 환경 변수

**앱별** — `apps/<app>/.env.local` (템플릿: `.env.example`):

| 변수 | 예시 | 설명 |
|---|---|---|
| `NEXT_PUBLIC_CONVEX_URL` | `https://your-deployment.convex.cloud` | 공유 Convex 배포 |
| `NEXT_PUBLIC_CONVEX_SITE_URL` | `https://your-deployment.convex.site` | Convex HTTP-action 호스트 (Better Auth 라우트) |
| `NEXT_PUBLIC_AUTH_ORIGIN` | `http://auth.lvh.me:3000` | 중앙 로그인 포털 |
| `AUTH_ORIGIN` | `http://auth.lvh.me:3000` | 위 값의 서버 쪽 복사본 |
| `CHAT_ORIGIN` | `http://chat.lvh.me:3001` | 이 앱 자신의 public origin |
| `COOKIE_DOMAIN` | `lvh.me` | 공유 부모 도메인 — **로컬에서는 lvh.me** |

**Convex 배포에** — `npx convex env set`으로 설정 (Better Auth가
`packages/backend/convex/auth.ts` 안에서 읽음):

| 변수 | 예시 | 설명 |
|---|---|---|
| `BETTER_AUTH_SECRET` | `openssl rand -base64 32` | 필수 서명 시크릿 |
| `SITE_URL` | `http://auth.lvh.me:3000` | Better Auth `baseURL` (auth 포털) |
| `COOKIE_DOMAIN` | `lvh.me` | `crossSubDomainCookies.domain` |
| `TRUSTED_ORIGINS` | `http://auth.lvh.me:3000,http://chat.lvh.me:3001` | 콤마 구분, 모든 앱의 origin |

---

## 의존성 없는 데모 (선택)

Convex를 설치하거나 어디에도 로그인하지 **않고** SSO 쿠키/리다이렉트 동작만
보고 싶다면, 킷에 손으로 만든 목(mock) 하네스(순수 Node HTTP 서버, 인메모리
사용자)가 들어 있습니다. 학습/테스트용 픽스처이며 **실제 앱 런타임이 아닙니다**:

```bash
pnpm demo:backend   # :3999 의 목 중앙 세션 저장소
pnpm demo:auth      # auth.lvh.me:3000 의 목 로그인 포털
pnpm demo:chat      # chat.lvh.me:3001 의 목 컨슈머 앱
```

실제로 쓰려면 `pnpm dev:*`(위의 Next.js + Convex 스택)을 사용하세요.

---

## 트러블슈팅

검증 중 실제로 겪은 버그들입니다 — 재발하기 쉬워 여기 기록합니다.

- **리다이렉트 대상이 `http://0.0.0.0:3001/...`가 됨.** `next dev -H 0.0.0.0`은
  `request.url`의 호스트를 `0.0.0.0`으로 만듭니다. public URL은 `request.url`이
  아니라 `Host` 헤더나 env에서 유도하세요. (`apps/chat/middleware.ts`와 로그인
  페이지의 리다이렉트 가드에서 처리됨.)

- **로그인 전에 `/login`이 500을 반환.** Convex `getCurrentUser` 쿼리가 익명
  방문자에 대해 null-safe해야 합니다. (`packages/backend/convex/auth.ts`의
  `authComponent.safeGetAuthUser(ctx) ?? null`로 처리됨.)

- **`signIn` / `signOut`이 CORS 에러로 실패.** 앱의 `authClient`가 다른 origin을
  호출하고 있습니다. `baseURL`을 비워 자기 `/api/auth`를 치게 하세요 — 위의
  "같은 출처 auth 클라이언트" 규칙 참고.

- **패키지 추가 후 Next.js 청크 404 / 하이드레이션 실패.** `pnpm install`을 다시
  실행하고, 계속되면 해당 앱의 `.next/`를 지우고 재시작하세요.

- **로그인했는데 다시 로그인 페이지로 튕김.** `*.localhost`를 쓰고 있습니다.
  `lvh.me`로 바꾸세요 — 위의 "lvh.me 규칙" 섹션 참고.

---

## 프로덕션 배포

각 앱을 공통 루트 도메인의 서브도메인에 자체 프로젝트(예: Vercel)로 배포하고,
`npx convex deploy`를 프로덕션 배포에 연결한 뒤, `COOKIE_DOMAIN` /
`crossSubDomainCookies.domain`을 그 루트 도메인으로 설정합니다. HTTPS에서는 세션
쿠키에 `Secure` 속성이 붙으므로, 실제 도메인에서 G1~G4 검증을 다시 실행하세요.
전체 호스트 설정·DNS·보안 하드닝 노트는
[`docs/poc-verification.md`](docs/poc-verification.md)에 있습니다. 교차 **루트**
도메인 SSO는 v1 범위에서 명시적으로 제외됩니다(ADR 로드맵 참고).

---

## 검증

- 아키텍처 흐름 게이트 **G1~G4**는 실제 Chrome에서 라이브 Convex + Better Auth
  스택 대상으로 수동 검증했습니다 — 상세 내용과 증거는
  [`docs/poc-verification.md`](docs/poc-verification.md).
- `scripts/browser-gates.mjs`(목 하네스)와
  `scripts/browser-gates-realstack.mjs`(실스택)는 CDP를 통해 헤드리스 Chrome으로
  게이트를 구동합니다. 실스택 스크립트는 **아직 CI용으로 안정적이지 않으며** —
  현재는 수동 검증이 기준입니다.
- 저장소 가드: `pnpm verify:versions`(`@convex-dev/better-auth` 0.12.x /
  `better-auth` ~1.6 / `convex` ^1.25+ 고정)와 `pnpm verify:forbidden`(기각된
  `@better-auth/sso`·`oidcProvider` 플러그인 차단 — ADR 참고).

---

## 프로젝트 상태

동작하는 개념 증명(PoC) 킷이며, 일부는 의도적으로 미완성입니다:

- **타입 스텁.** `packages/types-node` / `packages/types-react`는 placeholder
  스텁(샌드박스 우회)입니다. 실제 `@types/*` devDependency로 교체해야 하고, 그
  후 `next.config.mjs`의 `ignoreBuildErrors` / `ignoreDuringBuilds`를 제거하면
  `tsc --noEmit` + `next build`가 진짜 빌드 게이트가 됩니다. 그전까지
  `pnpm build` / `pnpm typecheck`는 구조 검사(`scripts/static-check.mjs`)만
  수행합니다.
- **게이트 자동화.** `scripts/browser-gates-realstack.mjs`는 불안정하며, 게이트는
  현재 수동으로 검증합니다.
- **라이선스.** 아직 미지정 — 공개 전에 `LICENSE`를 추가하세요.

---

## 문서

- [`docs/architecture-decision.md`](docs/architecture-decision.md) — ADR-0001: 이 구조를 택한 이유와 기각된 대안들.
- [`docs/poc-verification.md`](docs/poc-verification.md) — G1~G4 검증 보고서와 lvh.me 발견.
- [`docs/architecture-diagram.html`](docs/architecture-diagram.html) — 인터랙티브 흐름 다이어그램 (브라우저로 열기).
