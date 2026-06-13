import { spawn } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const artifactDir =
  process.env.ARTIFACT_DIR ?? ".omx/artifacts/browser-gates-realstack";
const authOrigin = process.env.AUTH_ORIGIN ?? "http://auth.lvh.me:3000";
const chatOrigin = process.env.CHAT_ORIGIN ?? "http://chat.lvh.me:3001";
const email = process.env.GATE_EMAIL ?? `gate-${Date.now()}@example.test`;
const password = process.env.GATE_PASSWORD ?? "correct horse battery staple";
const chromePort = Number(process.env.CHROME_PORT ?? 9222);
const chromePath =
  process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const profileDir =
  process.env.CHROME_PROFILE ?? "/private/tmp/sso-kit-poc-chrome-profile-realstack";
const sessionCookieName = "better-auth.session_token";
const signupButtonSelector = 'button[value="signup"]';
const logoutButtonSelector = '[data-testid="logout-button"]';

mkdirSync(artifactDir, { recursive: true });
rmSync(profileDir, { recursive: true, force: true });

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForUrl(url, options = {}) {
  const deadline = Date.now() + (options.timeout ?? 10000);
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, {
        redirect: "manual",
        headers: options.headers ?? {},
      });
      return response;
    } catch (error) {
      lastError = error;
      await sleep(250);
    }
  }
  throw lastError ?? new Error(`Timed out waiting for ${url}`);
}

async function waitForChrome() {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${chromePort}/json/version`);
      if (response.ok) return response.json();
    } catch {}
    await sleep(250);
  }
  throw new Error("Chrome DevTools endpoint did not become ready");
}

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
    ws.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        const { resolve, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) reject(new Error(message.error.message));
        else resolve(message.result);
        return;
      }
      const listeners = this.listeners.get(message.method) ?? [];
      for (const listener of listeners) listener(message.params);
    });
  }

  static async connect(wsUrl) {
    const ws = new WebSocket(wsUrl);
    await new Promise((resolve, reject) => {
      ws.addEventListener("open", resolve, { once: true });
      ws.addEventListener("error", reject, { once: true });
    });
    return new Cdp(ws);
  }

  send(method, params = {}) {
    const id = this.nextId++;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
  }

  waitEvent(method, timeout = 5000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.listeners.set(
          method,
          (this.listeners.get(method) ?? []).filter((listener) => listener !== onEvent),
        );
        reject(new Error(`Timed out waiting for ${method}`));
      }, timeout);
      const onEvent = (params) => {
        clearTimeout(timer);
        this.listeners.set(
          method,
          (this.listeners.get(method) ?? []).filter((listener) => listener !== onEvent),
        );
        resolve(params);
      };
      this.listeners.set(method, [...(this.listeners.get(method) ?? []), onEvent]);
    });
  }

  close() {
    this.ws.close();
  }
}

async function newPage() {
  const response = await fetch(`http://127.0.0.1:${chromePort}/json/new?about:blank`, {
    method: "PUT",
  });
  if (!response.ok) throw new Error(`Failed to create Chrome page: ${response.status}`);
  const target = await response.json();
  const page = await Cdp.connect(target.webSocketDebuggerUrl);
  await page.send("Page.enable");
  await page.send("Runtime.enable");
  await page.send("Network.enable");
  return page;
}

async function navigate(page, url) {
  const load = page.waitEvent("Page.loadEventFired", 8000).catch(() => null);
  await page.send("Page.navigate", { url });
  await load;
  await sleep(300);
}

async function evaluate(page, expression) {
  const result = await page.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text ?? "Runtime evaluation failed");
  }
  return result.result.value;
}

async function screenshot(page, name) {
  const result = await page.send("Page.captureScreenshot", { format: "png", fromSurface: true });
  const file = join(artifactDir, name);
  writeFileSync(file, Buffer.from(result.data, "base64"));
  return file;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function waitForLocation(page, predicate, message, timeout = 10000) {
  const deadline = Date.now() + timeout;
  let current = "";
  while (Date.now() < deadline) {
    current = await evaluate(page, "location.href");
    if (predicate(current)) return current;
    await sleep(100);
  }
  throw new Error(`${message}; last URL was ${current}`);
}

async function waitForReactHydration(page, selector, timeout = 15000) {
  const deadline = Date.now() + timeout;
  const selectorLiteral = JSON.stringify(selector);
  let lastState;
  while (Date.now() < deadline) {
    lastState = await evaluate(
      page,
      `(() => {
        const element = document.querySelector(${selectorLiteral});
        if (!element) return { exists: false, hydrated: false };
        const reactKey = Object.keys(element).find((key) => key.startsWith("__react"));
        return {
          exists: true,
          hydrated: Boolean(reactKey),
          reactKey: reactKey ?? null,
          disabled: Boolean(element.disabled),
          text: element.textContent ?? "",
        };
      })()`,
    );
    if (lastState?.hydrated) return lastState;
    await sleep(100);
  }
  throw new Error(
    `Timed out waiting for React hydration on ${selector}; last state ${JSON.stringify(lastState)}`,
  );
}

async function clickHydrated(page, selector) {
  await waitForReactHydration(page, selector);
  const load = page.waitEvent("Page.loadEventFired", 8000).catch(() => null);
  await evaluate(
    page,
    `(() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      if (!element) throw new Error("Missing click target: ${selector}");
      element.click();
    })()`,
  );
  await load;
  await sleep(500);
}

await waitForUrl(`${authOrigin}/login`);
await waitForUrl(`${chatOrigin}/protected`);

const chrome = spawn(
  chromePath,
  [
    "--headless=new",
    `--remote-debugging-port=${chromePort}`,
    `--user-data-dir=${profileDir}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-networking",
    "--disable-sync",
    "--host-resolver-rules=MAP *.localhost 127.0.0.1,MAP localhost 127.0.0.1,MAP *.lvh.me 127.0.0.1,MAP lvh.me 127.0.0.1",
    "about:blank",
  ],
  { stdio: "ignore" },
);

const events = [];
let page;

try {
  await waitForChrome();
  page = await newPage();

  await navigate(page, `${chatOrigin}/protected`);
  const redirectedUrl = await evaluate(page, "location.href");
  const redirectedText = await evaluate(page, "document.body.innerText");
  assert(redirectedUrl.startsWith(`${authOrigin}/login`), `Expected auth login redirect, got ${redirectedUrl}`);
  assert(redirectedUrl.includes(encodeURIComponent(`${chatOrigin}/protected`)), "Missing original redirect target");
  assert(redirectedText.includes("Login"), "Expected login page after unauthenticated chat access");
  events.push({ gate: "G3", step: "unauthenticated chat redirects to auth login", url: redirectedUrl });
  await screenshot(page, "G3-unauthenticated-chat-to-auth-login.png");

  await waitForReactHydration(page, signupButtonSelector);
  await evaluate(
    page,
    `(() => {
      document.querySelector('input[name="email"]').value = ${JSON.stringify(email)};
      document.querySelector('input[name="password"]').value = ${JSON.stringify(password)};
    })()`,
  );
  await clickHydrated(page, signupButtonSelector);
  const protectedUrl = await waitForLocation(
    page,
    (url) => url === `${chatOrigin}/protected`,
    "Expected signup to redirect back to chat",
  );
  const protectedText = await evaluate(page, "document.body.innerText");
  assert(protectedText.includes("Protected chat"), "Expected protected chat page");
  assert(protectedText.includes(email), "Expected authenticated user email on chat page");
  events.push({ gate: "G1", step: "chat accepted auth-issued session", url: protectedUrl, email });
  await screenshot(page, "G1-chat-authenticated-email.png");

  await navigate(page, `${authOrigin}/login?redirect=${encodeURIComponent(`${chatOrigin}/protected`)}`);
  const authText = await evaluate(page, "document.body.innerText");
  assert(authText.includes("Authenticated"), "Expected auth app to see existing session");
  assert(authText.includes(email), "Expected auth app to show authenticated email");
  events.push({ gate: "G1", step: "auth app also sees shared session", url: await evaluate(page, "location.href") });
  await screenshot(page, "G1-auth-app-sees-session.png");

  const cookiesBeforeLogout = await page.send("Network.getAllCookies");
  const sessionCookie = cookiesBeforeLogout.cookies.find(
    (cookie) => cookie.name === sessionCookieName,
  );
  assert(sessionCookie, `Expected ${sessionCookieName} cookie before logout`);
  events.push({
    gate: "G4",
    step: "cookie domain observed before logout",
    cookieName: sessionCookie.name,
    cookieDomain: sessionCookie.domain,
    sameSite: sessionCookie.sameSite,
  });

  await navigate(page, `${chatOrigin}/protected`);
  await clickHydrated(page, logoutButtonSelector);
  const logoutUrl = await waitForLocation(
    page,
    (url) => url.startsWith(`${authOrigin}/login`),
    "Expected auth login after logout",
  );
  const logoutText = await evaluate(page, "document.body.innerText");
  assert(logoutText.includes("Login"), "Expected auth login after logout");
  assert(!logoutText.includes(email), "Auth app should not show email after logout");
  events.push({ gate: "G2", step: "chat logout returns auth app to unauthenticated state", url: logoutUrl });
  await screenshot(page, "G2-auth-after-chat-logout.png");

  await navigate(page, `${chatOrigin}/protected`);
  const afterLogoutChatUrl = await evaluate(page, "location.href");
  const afterLogoutChatText = await evaluate(page, "document.body.innerText");
  assert(afterLogoutChatUrl.startsWith(`${authOrigin}/login`), "Expected chat to redirect after central logout");
  assert(afterLogoutChatText.includes("Login"), "Expected login page after central logout");
  assert(!afterLogoutChatText.includes(email), "Chat/auth should not expose email after central logout");
  events.push({ gate: "G2", step: "chat is unauthenticated immediately after central logout", url: afterLogoutChatUrl });
  await screenshot(page, "G2-chat-after-central-logout.png");

  const cookiesAfterLogout = await page.send("Network.getAllCookies");
  events.push({
    gate: "G2",
    step: "cookie jar after logout",
    cookies: cookiesAfterLogout.cookies.map((cookie) => ({
      name: cookie.name,
      domain: cookie.domain,
      expires: cookie.expires,
    })),
  });

  const result = {
    authOrigin,
    chatOrigin,
    email,
    passed: ["G1", "G2", "G3", "G4"],
    events,
  };
  writeFileSync(
    join(artifactDir, "browser-gates-realstack.json"),
    `${JSON.stringify(result, null, 2)}\n`,
  );
  console.log(JSON.stringify(result, null, 2));
} finally {
  if (page) page.close();
  chrome.kill("SIGTERM");
}
