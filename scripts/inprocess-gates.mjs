import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Readable } from "node:stream";
import { createAuthHandler } from "../apps/auth/server.mjs";
import { createChatHandler } from "../apps/chat/server.mjs";
import { createBackendHandler } from "../packages/backend/server.mjs";

const artifactDir = ".omx/artifacts/browser-gates";
mkdirSync(artifactDir, { recursive: true });

class MockResponse {
  constructor() {
    this.status = 200;
    this.headers = {};
    this.body = "";
    this.done = new Promise((resolve) => {
      this.resolve = resolve;
    });
  }

  writeHead(status, headers = {}) {
    this.status = status;
    for (const [key, value] of Object.entries(headers)) {
      this.headers[key.toLowerCase()] = value;
    }
  }

  end(body = "") {
    this.body += Buffer.isBuffer(body) ? body.toString("utf8") : String(body);
    this.resolve(this);
  }
}

async function invoke(handler, url, options = {}) {
  const parsed = new URL(url);
  const body = options.body ?? "";
  const req = Readable.from(body ? [Buffer.from(body)] : []);
  req.method = options.method ?? "GET";
  req.url = `${parsed.pathname}${parsed.search}`;
  req.headers = {
    host: parsed.host,
    ...(options.headers ?? {}),
  };
  const res = new MockResponse();
  await handler(req, res);
  return res.done;
}

function normalizeSetCookieHeader(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

class CookieJar {
  constructor() {
    this.cookies = new Map();
    this.rejections = [];
  }

  receive(setCookie, origin) {
    const originHost = new URL(origin).hostname.toLowerCase();
    for (const header of normalizeSetCookieHeader(setCookie)) {
      const parts = String(header).split(";").map((part) => part.trim());
      const [nameValue, ...attributes] = parts;
      const equalsIndex = nameValue.indexOf("=");
      const name = nameValue.slice(0, equalsIndex);
      const value = decodeURIComponent(nameValue.slice(equalsIndex + 1));
      const parsedAttributes = Object.fromEntries(
        attributes.map((attribute) => {
          const index = attribute.indexOf("=");
          if (index < 0) return [attribute.toLowerCase(), true];
          return [attribute.slice(0, index).toLowerCase(), attribute.slice(index + 1)];
        }),
      );
      const domain = String(parsedAttributes.domain ?? originHost).replace(/^\./, "").toLowerCase();
      const maxAge = parsedAttributes["max-age"] == null ? null : Number(parsedAttributes["max-age"]);
      const domainMatches = originHost === domain || originHost.endsWith(`.${domain}`);
      const chromeLocalhostDomainRejected = domain === "localhost" && originHost !== "localhost";
      if (!domainMatches || chromeLocalhostDomainRejected) {
        this.rejections.push({ name, domain, originHost, reason: "domain rejected by Chrome-like jar" });
        continue;
      }
      if (maxAge === 0) {
        this.cookies.delete(name);
      } else {
        this.cookies.set(name, { value, domain, path: parsedAttributes.path ?? "/" });
      }
    }
  }

  headerFor(url) {
    const host = new URL(url).hostname.toLowerCase();
    const entries = [];
    for (const [name, cookie] of this.cookies) {
      if (host === cookie.domain || host.endsWith(`.${cookie.domain}`)) {
        entries.push(`${name}=${encodeURIComponent(cookie.value)}`);
      }
    }
    return entries.join("; ");
  }

  snapshot() {
    return {
      accepted: [...this.cookies].map(([name, cookie]) => ({ name, domain: cookie.domain })),
      rejections: this.rejections,
    };
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function runScenario({ name, authOrigin, chatOrigin, cookieDomain }) {
  const backendHandler = createBackendHandler();
  const backendFetch = async (url, options = {}) => {
    const response = await invoke(backendHandler, url, options);
    return new Response(response.body, { status: response.status, headers: response.headers });
  };
  const authHandler = createAuthHandler({ authOrigin, chatOrigin, cookieDomain, backendFetch });
  const chatHandler = createChatHandler({ authOrigin, chatOrigin, cookieDomain, backendFetch });
  const jar = new CookieJar();
  const events = [];

  async function request(url, options = {}) {
    const origin = new URL(url).origin;
    const handler = origin === authOrigin ? authHandler : chatHandler;
    const cookieHeader = jar.headerFor(url);
    const headers = {
      ...(options.headers ?? {}),
      ...(cookieHeader ? { cookie: cookieHeader } : {}),
    };
    const response = await invoke(handler, url, { ...options, headers });
    jar.receive(response.headers["set-cookie"], origin);
    return response;
  }

  const email = `gate-${name}-${Date.now()}@example.test`;
  const password = "correct horse battery staple";
  const protectedUrl = `${chatOrigin}/protected`;

  const unauthenticatedChat = await request(protectedUrl);
  assert(unauthenticatedChat.status === 302, `${name}: expected unauthenticated chat redirect`);
  assert(
    String(unauthenticatedChat.headers.location).startsWith(`${authOrigin}/login`),
    `${name}: expected redirect to auth login`,
  );
  assert(
    String(unauthenticatedChat.headers.location).includes(encodeURIComponent(protectedUrl)),
    `${name}: expected original protected URL in redirect`,
  );
  events.push({ gate: "G3", step: "unauthenticated chat redirected to auth login", status: unauthenticatedChat.status });

  const loginPage = await request(unauthenticatedChat.headers.location);
  assert(loginPage.body.includes("Login"), `${name}: expected login page`);
  events.push({ gate: "G3", step: "auth login rendered redirect form" });

  const signupBody = new URLSearchParams({
    email,
    password,
    mode: "signup",
    redirect: protectedUrl,
  }).toString();
  const signup = await request(`${authOrigin}/login`, {
    method: "POST",
    body: signupBody,
    headers: { "content-type": "application/x-www-form-urlencoded" },
  });
  assert(signup.status === 302, `${name}: expected signup redirect`);
  assert(signup.headers.location === protectedUrl, `${name}: expected redirect back to protected chat`);
  events.push({ gate: "G3", step: "signup redirected to original chat URL", cookies: jar.snapshot() });

  const protectedChat = await request(signup.headers.location);
  assert(protectedChat.status === 200, `${name}: expected authenticated protected chat`);
  assert(protectedChat.body.includes(email), `${name}: expected email on protected chat`);
  events.push({ gate: "G1", step: "chat accepted auth-issued shared session", email });

  const authSession = await request(`${authOrigin}/login?redirect=${encodeURIComponent(protectedUrl)}`);
  assert(authSession.status === 200, `${name}: expected auth session page`);
  assert(authSession.body.includes("Authenticated"), `${name}: expected auth app to see session`);
  assert(authSession.body.includes(email), `${name}: expected auth app email`);
  events.push({ gate: "G1", step: "auth app saw same central session" });

  const logout = await request(`${chatOrigin}/api/auth/sign-out`, { method: "POST" });
  assert(logout.status === 302, `${name}: expected chat logout redirect`);
  assert(String(logout.headers.location).startsWith(`${authOrigin}/login`), `${name}: expected logout to auth login`);
  events.push({ gate: "G2", step: "chat logout deleted central session", cookies: jar.snapshot() });

  const authAfterLogout = await request(`${authOrigin}/login`);
  assert(authAfterLogout.body.includes("Login"), `${name}: expected auth login after logout`);
  assert(!authAfterLogout.body.includes(email), `${name}: auth app still exposed logged out email`);
  events.push({ gate: "G2", step: "auth app immediately unauthenticated after logout" });

  const chatAfterLogout = await request(protectedUrl);
  assert(chatAfterLogout.status === 302, `${name}: expected chat redirect after logout`);
  assert(String(chatAfterLogout.headers.location).startsWith(`${authOrigin}/login`), `${name}: expected chat unauthenticated`);
  events.push({ gate: "G2", step: "chat app immediately unauthenticated after logout" });

  return {
    name,
    authOrigin,
    chatOrigin,
    cookieDomain,
    passed: ["G1", "G2", "G3"],
    events,
    cookies: jar.snapshot(),
  };
}

async function captureScenario(config) {
  try {
    return { ok: true, result: await runScenario(config) };
  } catch (error) {
    return { ok: false, config, error: error instanceof Error ? error.message : String(error) };
  }
}

const localhostAttempt = await captureScenario({
  name: "localhost",
  authOrigin: "http://auth.localhost:3000",
  chatOrigin: "http://chat.localhost:3001",
  cookieDomain: "localhost",
});
const lvhAttempt = await captureScenario({
  name: "lvh",
  authOrigin: "http://auth.lvh.me:3000",
  chatOrigin: "http://chat.lvh.me:3001",
  cookieDomain: "lvh.me",
});

const output = {
  note: "TCP listen and Chrome automation are blocked in this sandbox; this validates the same handlers with a Chrome-like cookie jar.",
  localhostAttempt,
  activeDomain: lvhAttempt.ok ? "lvh.me" : null,
  lvhAttempt,
};

writeFileSync(join(artifactDir, "05-inprocess-gates.json"), `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify(output, null, 2));
