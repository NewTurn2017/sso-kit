import { createServer } from "node:http";
import { pathToFileURL } from "node:url";

const port = Number(process.env.CHAT_PORT ?? 3001);

function parseCookies(req) {
  return Object.fromEntries(
    (req.headers.cookie ?? "")
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf("=");
        if (index < 0) return [part, ""];
        return [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
      }),
  );
}

function sessionCookie(token, cookieDomain, maxAge = 60 * 60) {
  return [
    `sso_session=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
    `Domain=${cookieDomain}`,
  ].join("; ");
}

async function backend(backendUrl, backendFetch, path, options = {}) {
  const response = await backendFetch(`${backendUrl}${path}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options.headers ?? {}),
    },
  });
  return response.json();
}

async function currentUser(req, backendUrl, backendFetch) {
  const token = parseCookies(req).sso_session;
  if (!token) return null;
  const result = await backend(backendUrl, backendFetch, `/session?token=${encodeURIComponent(token)}`);
  return result.user;
}

function html(res, body, status = 200, headers = {}) {
  res.writeHead(status, { "content-type": "text/html; charset=utf-8", ...headers });
  res.end(body);
}

function redirectToLogin(req, res, authOrigin, chatOrigin) {
  const requested = new URL(req.url ?? "/protected", chatOrigin);
  const login = new URL("/login", authOrigin);
  login.searchParams.set("redirect", requested.toString());
  res.writeHead(302, { location: login.toString() });
  res.end();
}

export function createChatHandler({
  backendUrl = process.env.BACKEND_URL ?? "http://127.0.0.1:3999",
  backendFetch = fetch,
  authOrigin = process.env.AUTH_ORIGIN ?? "http://auth.localhost:3000",
  chatOrigin = process.env.CHAT_ORIGIN ?? "http://chat.localhost:3001",
  cookieDomain = process.env.COOKIE_DOMAIN ?? "localhost",
} = {}) {
  return async (req, res) => {
    const url = new URL(req.url ?? "/", chatOrigin);

    if (req.method === "GET" && url.pathname === "/api/auth/get-session") {
      const user = await currentUser(req, backendUrl, backendFetch);
      res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      return res.end(JSON.stringify({ user }));
    }

    if (req.method === "POST" && url.pathname === "/api/auth/sign-out") {
      const token = parseCookies(req).sso_session;
      if (token) {
        await backend(backendUrl, backendFetch, "/logout", { method: "POST", body: JSON.stringify({ token }) });
      }
      res.writeHead(302, {
        "set-cookie": sessionCookie("", cookieDomain, 0),
        location: `${authOrigin}/login`,
      });
      return res.end();
    }

    if (req.method === "GET" && url.pathname === "/protected") {
      const user = await currentUser(req, backendUrl, backendFetch);
      if (!user) return redirectToLogin(req, res, authOrigin, chatOrigin);
      return html(
        res,
        `<main><h1>Protected chat</h1><p id="email">${user.email}</p><form method="post" action="/api/auth/sign-out"><button>Logout</button></form></main>`,
      );
    }

    if (req.method === "GET" && url.pathname === "/") {
      return html(res, `<main><h1>SSO Kit Chat</h1><a href="/protected">Open protected chat</a></main>`);
    }

    return html(res, "<main><h1>Not found</h1></main>", 404);
  };
}

export function createChatServer(options = {}) {
  return createServer(createChatHandler(options));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const authOrigin = process.env.AUTH_ORIGIN ?? "http://auth.localhost:3000";
  const chatOrigin = process.env.CHAT_ORIGIN ?? "http://chat.localhost:3001";
  const cookieDomain = process.env.COOKIE_DOMAIN ?? "localhost";
  const server = createChatServer();
  server.listen(port, "0.0.0.0", () => {
    console.log(`SSO Kit chat app listening on ${chatOrigin}`);
    console.log(`Cookie domain: ${cookieDomain}; auth origin: ${authOrigin}`);
  });
}
