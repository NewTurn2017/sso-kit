# ADR-0001: SSO Kit 아키텍처 결정

- 상태: **채택 확정** (게이트 G1~G4 실스택 통과, 리스크 1·2 클로즈 — `docs/poc-verification.md` 참조)
- 날짜: 2026-06-12 (검증 갱신: 2026-06-13)
- 근거 조사: Codex 사실 검증 리포트 (2026-06-12, 본 문서 출처 섹션에 URL 수록)
- 검증 메모: 로컬 dev 도메인은 `*.localhost`가 실브라우저에서 쿠키 공유 불가로 판명되어 **`lvh.me`로 확정** (게이트 3 결과)

## 1. 결정 요약

**영상의 "중앙 인증 서비스 + 자체 세션 검증 API(phone-home) + Redis 캐싱" 아키텍처를 직접 구현하지 않는다.**
대신 같은 설계 사상(중앙 집중 세션, 쿠키 도메인 공유, 즉시 로그아웃 전파)을 Better Auth와 Convex의 **내장 기능으로 달성**한다.

채택 아키텍처 한 줄 요약:

> 하나의 Convex 배포가 중앙 세션 저장소, Better Auth `crossSubDomainCookies`가 쿠키 공유,
> 각 앱의 Next.js 프록시 라우트가 first-party 쿠키 경계 — 직접 구현하는 인증 서버는 0줄.

범위: **v1은 같은 루트 도메인의 서브도메인 간 SSO만 지원한다** (`auth.example.com` ↔ `chat.example.com` ↔ `notes.example.com`). 서로 다른 루트 도메인 간 SSO는 명시적 비범위(로드맵 섹션 참고).

## 2. 영상 아키텍처 대비 매핑

영상의 설계 사상은 옳다. 다만 2026년 현재 그 구성 요소 대부분이 라이브러리/플랫폼 기능으로 존재하므로, 공개 키트에서 이를 손으로 재구현하면 유지보수 부담과 보안 리스크만 늘어난다.

| 영상의 구성 요소 | 이 키트에서의 대응 | 직접 구현 여부 |
|---|---|---|
| 중앙 인증 서비스 (Auth Service) | `apps/auth` (Next.js 로그인 포털) + 공유 Convex 배포의 Better Auth | 불필요 |
| 인증 서비스 자체 DB (세션/자격증명) | Convex (`@convex-dev/better-auth` 컴포넌트 테이블) | 불필요 |
| `Set-Cookie` + domain 속성 | Better Auth `advanced.crossSubDomainCookies: { enabled: true, domain: "example.com" }` | 설정 1줄 |
| 세션 검증 API (`/sessions` phone-home) | Better Auth 내장 세션 검증 + `convexBetterAuthNextJs` 서버 헬퍼 (`isAuthenticated`, `getToken`, `preloadAuthQuery`) | 불필요 |
| 미인증 302 리다이렉트 | 각 앱의 Next.js 미들웨어 → `auth.example.com/login?redirect=...` | 미들웨어 ~20줄 (키트가 제공) |
| 로그아웃 시 세션 무효화 전파 | Better Auth `signOut` → 공유 Convex 세션 저장소에서 삭제 → 전 앱 즉시 무효 | 불필요 |
| Redis 캐싱 (phone-home 병목 완화) | Convex 자체가 캐싱/리액티브 백엔드. 추가로 Better Auth `session.cookieCache` 옵션이 단기 서명 쿠키로 검증 호출 자체를 줄임 (PoC에서 검증) | 불필요 |
| JWT 무효화 복잡성 (영상이 경고) | 세션 기반 유지. Convex 클라이언트 인증용 JWT는 컴포넌트가 내부적으로 관리 — 키트 사용자에게 노출 안 됨 | 해당 없음 |

## 3. 채택 아키텍처

### 3.1 구성

```
                         [브라우저]
              session cookie (domain=example.com)
           ┌──────────────┼──────────────┐
           ▼              ▼              ▼
  auth.example.com  chat.example.com  notes.example.com
   (apps/auth)       (apps/chat)      (apps/notes)
   로그인/가입 UI      데모 앱 1         데모 앱 2
   /api/auth/* ──┐    /api/auth/* ─┐   /api/auth/* ─┐
                 │  (Next.js 프록시 라우트, first-party 쿠키 경계)
                 ▼              ▼              ▼
           ┌─────────────────────────────────────┐
           │      단일 Convex 배포 (packages/backend)│
           │  • @convex-dev/better-auth 컴포넌트   │
           │  • users / sessions (Better Auth 관리) │
           │  • 앱별 테이블 (chats, notes, ...)     │
           └─────────────────────────────────────┘
```

### 3.2 핵심 흐름

**로그인:**
1. 미인증 사용자가 `chat.example.com` 접근 → 미들웨어가 세션 부재 감지 → `auth.example.com/login?redirect=...`로 302.
2. auth 앱에서 로그인 (email/password 또는 소셜). Better Auth가 auth 앱의 `/api/auth` 프록시를 통해 응답하므로 쿠키는 first-party로 설정되고, `crossSubDomainCookies` 덕분에 `Domain=example.com`이 붙는다.
3. `redirect` 파라미터로 원래 앱 복귀. 브라우저가 쿠키를 자동 전송.

**서비스 간 인증 (영상의 phone-home 대체):**
- 각 앱의 미들웨어/서버 컴포넌트는 `convexBetterAuthNextJs`가 제공하는 `isAuthenticated` / `getToken` / `preloadAuthQuery`로 세션을 검증한다. 검증 대상은 공유 Convex 배포 — 즉 "중앙에 물어본다"는 사상은 동일하나, 검증 API를 직접 만들고 운영할 필요가 없다.
- 앱별 데이터는 같은 Convex 배포의 앱별 테이블에 user id 기준으로 저장 (영상의 Chat DB / Notes DB에 해당). 별도 DB를 쓰고 싶은 사용자를 위해 "user id만 가져다 쓰는" 패턴도 문서화한다.

**로그아웃:**
- 어느 앱에서든 `signOut` → 중앙 세션 저장소(Convex)에서 세션 삭제 + 쿠키 클리어 → 다른 앱은 다음 요청에서 즉시 미인증 처리. 영상이 강조한 "JWT 무효화 지옥"이 구조적으로 발생하지 않는다.

### 3.3 레포 구조 (pnpm monorepo + Turborepo)

```
sso-kit/
├── apps/
│   ├── auth/        # 로그인 포털 (auth.example.com)
│   ├── chat/        # 데모 앱 (chat.example.com)
│   └── notes/       # 데모 앱 (notes.example.com)
├── packages/
│   ├── backend/     # 공유 Convex 배포 (better-auth 컴포넌트 + 앱별 스키마)
│   ├── auth/        # 공유 Better Auth 설정·클라이언트·미들웨어 헬퍼
│   └── ui/          # (선택) 공유 UI 컴포넌트
├── docs/            # 본 문서, 셋업 가이드, 트러블슈팅
├── turbo.json
└── pnpm-workspace.yaml
```

- 새 앱 추가 = `apps/` 아래 복사 + 프록시 라우트 + 미들웨어 + env 3개. 이 "5분 안에 앱 추가" 경험이 키트의 핵심 가치.
- 로컬 개발: `*.localhost` 서브도메인(예: `auth.localhost:3000`, `chat.localhost:3001`) 또는 `lvh.me` 계열 도메인으로 쿠키 공유를 재현. 어느 쪽이 안정적인지는 PoC 게이트 3에서 확정.

## 4. 근거 (Codex 검증 사실, 2026-06-12 기준)

1. **`crossSubDomainCookies`는 정확히 이 용도로 공식 문서화됨** — `auth.example.com`에서 로그인하고 `app.example.com`에서 같은 세션을 읽는 시나리오. 단 같은 루트 도메인 한정.
   출처: https://better-auth.com/docs/concepts/cookies (Better Auth v1.6, 최신 릴리스 v1.6.17)
2. **`oidcProvider` 플러그인은 기각 사유가 명확함** — 문서에 "soon be deprecated in favor of OAuth Provider Plugin", "may not be suitable for production use" 명시, JWKS "Not fully implemented".
   출처: https://better-auth.com/docs/plugins/oidc-provider
3. **`@better-auth/sso` 플러그인은 이름과 달리 외부 IdP를 소비하는 쪽**이며, Convex 통합에서 incompatible로 표시됨(Node.js 직접 의존). 키트 문서에서 용어 혼동 주의 필요.
   출처: https://better-auth.com/docs/plugins/sso , https://labs.convex.dev/better-auth/supported-plugins
4. **`@convex-dev/better-auth`(v0.12.2)는 Next.js 프록시 패턴을 공식 제공** — 인증 라우트는 Convex HTTP action(`*.convex.site`)에 등록되고, `app/api/auth/[...all]/route.ts` 프록시로 first-party 쿠키 경계를 만든다. 서버 헬퍼: `handler`, `preloadAuthQuery`, `isAuthenticated`, `getToken`, `fetchAuthQuery` 등. peer 범위: `better-auth >=1.6.9 <1.7.0`, `convex ^1.25.0`.
   출처: https://labs.convex.dev/better-auth/framework-guides/next , https://github.com/get-convex/better-auth
5. **동일 컨셉의 공개 키트는 확인되지 않음** — 공식 예제(`examples/next` 등)는 "starter가 아님"을 README에 명시. 이 레포의 포지셔닝 공간이 비어 있음.
   출처: https://github.com/get-convex/better-auth/tree/main/examples

## 5. 기각한 대안

| 대안 | 기각 사유 |
|---|---|
| **영상 그대로: 자체 인증 서버 + `/sessions` API + Redis** | Better Auth + Convex가 이미 제공하는 것을 재발명. 공개 키트에서 보안 민감 코드(세션 발급/검증)를 직접 유지보수해야 하고, Redis가 셋업 마찰을 추가해 "클론하고 바로 동작" 목표에 반함. |
| **`oidcProvider` 기반 크로스 도메인 SSO를 v1 기본으로** | 플러그인이 deprecated 예고 + 프로덕션 부적합 명시. 공개 키트의 기반으로 삼기엔 수명 리스크가 큼. 후속 OAuth Provider Plugin 안정화 시 v2로 재평가. |
| **Stateless JWT 세션** | 영상의 지적대로 로그아웃 전파(토큰 무효화)가 복잡. Better Auth 기본도 세션 기반. 채택할 이유 없음. |
| **앱마다 독립 Convex 배포 + 중앙 인증 배포에 phone-home** | 영상 구조에 가장 가깝지만, 배포 간 인증 연동이 컴포넌트의 공식 지원 밖이라 직접 구현량이 크게 늘어남. v1 가치(빠른 시작) 대비 과설계. |

## 6. 리스크와 검증 게이트 (PoC에서 통과해야 채택 확정)

| # | 리스크 | 검증 게이트 |
|---|---|---|
| 1 | **멀티앱 ↔ 단일 Convex 배포 공유가 공식 문서에 미보장** (조사에서 "확인 불가") | 서로 다른 포트/서브도메인의 Next.js 앱 2개가 같은 Convex 배포로 로그인·세션검증·로그아웃 전파에 성공해야 함. `baseURL`/`trustedOrigins`(와일드카드) 동적 처리 포함. |
| 2 | 각 앱의 `/api/auth` 프록시 origin이 달라질 때 Better Auth의 콜백·CSRF·origin 검증 동작 | 소셜 로그인 콜백 + email/password 양쪽에서 auth 앱 외 서브도메인 접근 시 정상 동작 확인. |
| 3 | 로컬 dev에서 서브도메인 쿠키 재현 (`*.localhost` vs `lvh.me`) | Chrome/Safari/Firefox 3종에서 dev 환경 쿠키 공유 확인. Safari ITP 주의 (문서가 reverse proxy/shared parent domain을 해법으로 제시). |
| 4 | `@convex-dev/better-auth`가 0.x (pre-1.0) | 키트에서 버전 고정(`0.12.x`) + 업그레이드 가이드 문서 제공. peer 범위(`better-auth <1.7.0`) 준수. |
| 5 | `session.cookieCache`로 검증 트래픽 절감 가능 여부 (조사 리포트 밖, 별도 확인 필요) | PoC에서 켜고 로그아웃 전파 지연(캐시 TTL 동안 세션이 살아 보이는 문제)과의 트레이드오프 측정 후 기본값 결정. |

게이트 1 또는 2가 실패하면: "앱별 독립 Better Auth 인스턴스 + 공유 세션 테이블" 또는 "auth 앱 단독 쿠키 발급 + 타 앱은 검증 전용" 구조로 후퇴 검토. 결정은 PoC 결과를 보고 본 문서를 개정해서 내린다.

## 7. 로드맵

- **v1**: 서브도메인 SSO (본 문서 범위). 데모 앱 2개, 친절한 셋업 가이드, Vercel 멀티 프로젝트 배포 가이드.
- **v1.x**: 새 앱 추가 스캐폴딩 스크립트(또는 `create-*` CLI), 조직/멀티테넌시 옵션 문서.
- **v2 (조건부)**: Better Auth의 차기 OAuth Provider Plugin이 stable이 되면 서로 다른 루트 도메인 간 SSO 지원 재평가.
