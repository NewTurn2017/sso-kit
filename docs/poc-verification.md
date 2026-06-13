# PoC 검증 보고서 — ADR-0001 게이트 G1~G4

> **2차 갱신 (2026-06-13): 실스택 검증 완료 — ADR 리스크 1·2 클로즈.** 아래 "실스택 검증" 섹션 참조. 이 문서 본문(1차)은 데모 하네스 검증 기록이다.

## 실스택 검증 (Next.js dev 2개 앱 + Convex 클라우드 + Better Auth 1.6.17)

수동 브라우저 검증(Chrome, 격리 프로필)으로 전 게이트 통과:

| 게이트 | 결과 | 증거 |
|---|---|---|
| G3 미인증 리다이렉트 | **통과** | `chat.lvh.me:3001/protected` → `auth.lvh.me:3000/login?redirect=<원래URL>` |
| G1 교차 서브도메인 세션 | **통과** | auth에서 가입 → chat 보호 페이지가 이메일 표시, auth 로그인 페이지도 "Authenticated"+이메일 렌더 |
| G2 중앙 로그아웃 전파 | **통과** | chat에서 `authClient.signOut()` → auth 로그인 폼 복귀, chat 재접근 즉시 차단 |
| G4 쿠키 | **통과** | `Set-Cookie: better-auth.session_token=...; Domain=lvh.me; HttpOnly; SameSite=Lax` (curl로 헤더 확인) |

**ADR 리스크 클로즈:**
- 리스크 1 (멀티앱 ↔ 단일 Convex 배포): **클로즈.** 서로 다른 두 Next.js 앱이 하나의 Convex 배포(betterAuth 컴포넌트)로 가입·검증·로그아웃 전파에 성공.
- 리스크 2 (앱별 프록시 origin과 trustedOrigins/CSRF): **클로즈.** 가입은 auth origin, 로그아웃은 chat origin 경유로 모두 수용됨. Origin 헤더 없는 요청은 403(`MISSING_OR_NULL_ORIGIN`) — CSRF 보호 작동 확인.

**실스택 검증 중 발견·수정된 버그 (전부 키트 README/트러블슈팅에 반영할 것):**
1. `next dev -H 0.0.0.0`에서 `request.url`의 호스트가 `0.0.0.0`이 됨 → 미들웨어 복귀 URL은 Host 헤더/env로 유도해야 함 (수정 완료).
2. 미인증 시 `getCurrentUser`가 throw → 로그인 페이지 500. 컴포넌트의 null-safe 경로로 수정 완료.
3. **각 앱의 authClient는 반드시 자기 자신의 `/api/auth` 프록시를 호출해야 함** (same-origin). auth origin을 직접 호출하면 CORS preflight 차단 (수정 완료 — 이 키트 아키텍처의 핵심 규칙).
4. 워크스페이스 패키지 추가 후 `pnpm install` 재실행 없이 dev 서버를 켜면 Next 청크 404 → 하이드레이션 실패. `.next` 삭제 + 재설치로 해결.

**잔여 엔지니어링 부채 (아키텍처 아님, 키트 품질):**
- [ ] `scripts/browser-gates-realstack.mjs` 자동화 스크립트가 아직 불안정 (수동 검증으로 대체함). CI용으로 수리 필요.
- [ ] `packages/types-node`/`packages/types-react` 가짜 타입 스텁을 실제 `@types/node`/`@types/react` devDependency로 교체 (Codex 샌드박스 제약 우회의 잔재).
- [ ] README 셋업 가이드 작성 (키트의 본래 목적).

---

- 검증일: 2026-06-13 (1차: 데모 하네스)
- 검증 방법: 실제 헤드리스 Chrome(CDP)을 `scripts/browser-gates.mjs`로 구동, 데모 하네스 3-서버(backend :3999 / auth :3000 / chat :3001) 대상 E2E
- 증거: `.omx/artifacts/browser-gates/` (스크린샷 5장, `browser-gates.json`, Codex 세션의 차단 증거 00~07)

## 결과 요약

| 게이트 | 결과 | 증거 |
|---|---|---|
| G1 — 교차 서브도메인 세션 인식 | **통과** | auth에서 가입 → `chat.lvh.me:3001/protected`가 사용자 이메일 표시, auth 앱도 동일 세션 인식. `G1-*.png` |
| G2 — 중앙 로그아웃 전파 | **통과** | chat에서 로그아웃 → auth·chat 모두 즉시 미인증, 로그아웃 후 쿠키 저장소 빈 상태 확인. `G2-*.png` |
| G3 — 미인증 리다이렉트 루프 | **통과** | 미인증 chat 접근 → `auth.../login?redirect=<원래URL>` → 로그인 → 원래 페이지 복귀. `G3-*.png` |
| G4 — dev 도메인 결정 | **통과 (lvh.me 채택)** | 아래 핵심 발견 참조. 쿠키 도메인 `.lvh.me`, SameSite=Lax 관측. |

## 핵심 발견: dev 도메인은 `*.localhost`가 아니라 `lvh.me`

- `COOKIE_DOMAIN=localhost` + `auth.localhost`/`chat.localhost` 구성은 **실제 Chrome에서 실패**했다. 서버는 `Set-Cookie: ...; Domain=localhost`를 정상 발급했지만(curl로 확인) Chrome이 해당 쿠키를 공유하지 않아 가입 직후 다시 로그인 페이지로 튕겼다.
- `COOKIE_DOMAIN=lvh.me` + `auth.lvh.me`/`chat.lvh.me` 구성은 동일 코드로 G1~G4 전부 통과했다. Chrome 쿠키 저장소에 `Domain=.lvh.me`로 기록됨을 CDP `Network.getAllCookies`로 확인.
- Codex의 in-process 쿠키 jar 시뮬레이션(`05-inprocess-gates.json`, `06-domain-decision.md`)도 같은 예측을 했고, 본 검증으로 실브라우저에서 확정.
- **키트 결론**: 로컬 개발 기본값은 `lvh.me`(공용 DNS가 127.0.0.1로 해석) 기반 서브도메인. README 셋업 가이드에 이 함정(`*.localhost` 쿠키 공유 불가)을 명시할 것.

## 이 검증이 증명한 것 / 증명하지 않은 것

> **갱신(2026-06-13): 아래 "아직 증명하지 않은 것"은 1차 데모 하네스 시점의 기록이다.** 이후 실스택(Next.js dev 2개 앱 + Convex 클라우드 `impartial-ostrich-518` + Better Auth 1.6.17)으로 G1~G4를 재검증해 ADR 리스크 1·2를 클로즈했다 — 이 문서 상단 "실스택 검증" 섹션 참조. 이 섹션은 검증 이력 보존을 위해 남겨 둔다.

**증명한 것 (아키텍처 흐름 레벨):**
- ADR-0001의 쿠키 도메인 공유 + 중앙 세션 저장소 + 미들웨어 리다이렉트 구조가 실브라우저에서 성립한다.
- 로그아웃이 중앙 세션 삭제만으로 전 앱에 즉시 전파된다.

**아직 증명하지 않은 것 (실스택 레벨 — 잔여 작업):**
- 검증에 사용된 것은 의존성 없는 데모 하네스(`apps/*/server.mjs`, `packages/backend/server.mjs`)다. Codex 실행 환경이 네트워크 차단(`pnpm install` 불가, TCP listen EPERM)이어서 실제 Convex + Better Auth 런타임을 띄울 수 없었고, 대신 공식 패턴의 실스택 소스(`apps/*/src/lib/auth-server.ts`, `app/api/auth/[...all]/route.ts`, `packages/backend/convex/*`)와 데모 하네스의 2층 구조로 구현했다.
- 그 시점엔 ADR-0001 리스크 1(멀티앱 ↔ 단일 Convex 배포 공유)과 리스크 2(앱별 프록시 origin에 대한 Better Auth의 trustedOrigins/CSRF 동작)가 열려 있었다. **이후 `pnpm install` → 실 Convex 배포(`impartial-ostrich-518`) 연결 → 실스택 G1~G4 재실행으로 두 리스크 모두 클로즈됨** (상단 "실스택 검증" 참조).

## 잔여 작업 체크리스트

- [x] `pnpm install` → `packages/backend`에서 `convex dev` (실 배포 `impartial-ostrich-518` 연결)
- [x] 실스택용 env 구성: `COOKIE_DOMAIN=lvh.me`, `crossSubDomainCookies.domain`, 앱별 `trustedOrigins`
- [x] 실스택 G1~G4 재실행 → ADR 리스크 1·2 클로즈 (수동 Chrome 검증, 상단 섹션)
- [x] Next.js 실행 경로를 기본 `dev` 스크립트로 승격, 데모 하네스(`server.mjs` 3종)는 `demo:*` 스크립트로 강등 (2026-06-13). 두 앱 모두 Next 15 / React 19로 정렬.
- [ ] README 셋업 가이드 작성 (lvh.me 함정 포함) — **진행 중**
- [ ] `scripts/browser-gates-realstack.mjs` 자동화 안정화 (현재 수동 검증으로 대체 — P2)
- [ ] `packages/types-node`/`types-react` 가짜 스텁 제거 → 실제 `@types/*` 설치 → `next.config` validation skip 해제 (P1)
