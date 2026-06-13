import { createServer } from "node:http";
import { pathToFileURL } from "node:url";

const port = Number(process.env.AUTH_PORT ?? 3000);

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

async function readForm(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Object.fromEntries(new URLSearchParams(Buffer.concat(chunks).toString("utf8")));
}

function safeRedirect(value, chatOrigin, authOrigin) {
  if (!value) return `${chatOrigin}/protected`;
  try {
    const target = new URL(value);
    if ([authOrigin, chatOrigin].includes(target.origin)) return target.toString();
  } catch {}
  return `${chatOrigin}/protected`;
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

export function createAuthHandler({
  backendUrl = process.env.BACKEND_URL ?? "http://127.0.0.1:3999",
  backendFetch = fetch,
  authOrigin = process.env.AUTH_ORIGIN ?? "http://auth.localhost:3000",
  chatOrigin = process.env.CHAT_ORIGIN ?? "http://chat.localhost:3001",
  cookieDomain = process.env.COOKIE_DOMAIN ?? "localhost",
} = {}) {
  return async (req, res) => {
    const url = new URL(req.url ?? "/", authOrigin);

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

    if (req.method === "POST" && url.pathname === "/login") {
      const form = await readForm(req);
      const mode = form.mode === "signup" ? "signup" : "login";
      const result = await backend(backendUrl, backendFetch, `/${mode}`, {
        method: "POST",
        body: JSON.stringify({ email: form.email, password: form.password }),
      });
      if (!result.token) {
        return html(res, `<main><p>Authentication failed</p><a href="/login">Try again</a></main>`, 401);
      }
      res.writeHead(302, {
        "set-cookie": sessionCookie(result.token, cookieDomain),
        location: safeRedirect(form.redirect, chatOrigin, authOrigin),
      });
      return res.end();
    }

    if (req.method === "GET" && url.pathname === "/login") {
      const user = await currentUser(req, backendUrl, backendFetch);
      const redirect = safeRedirect(url.searchParams.get("redirect"), chatOrigin, authOrigin);
      if (user) {
        return html(
          res,
          `<main><h1>Authenticated</h1><p>${user.email}</p><a href="${redirect}">Continue</a><form method="post" action="/api/auth/sign-out"><button>Logout</button></form></main>`,
        );
      }
      return html(
        res,
        `<main><h1>Login</h1><form method="post" action="/login"><input type="hidden" name="redirect" value="${redirect}"><p><label>Email <input name="email" type="email" required></label></p><p><label>Password <input name="password" type="password" required></label></p><button name="mode" value="login">Login</button><button name="mode" value="signup">Sign up</button></form></main>`,
      );
    }

    if (req.method === "GET" && url.pathname === "/") {
      return html(res, `<main><h1>SSO Kit Auth</h1><a href="/login">Login</a></main>`);
    }

    return html(res, "<main><h1>Not found</h1></main>", 404);
  };
}

export function createAuthServer(options = {}) {
  return createServer(createAuthHandler(options));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const authOrigin = process.env.AUTH_ORIGIN ?? "http://auth.localhost:3000";
  const chatOrigin = process.env.CHAT_ORIGIN ?? "http://chat.localhost:3001";
  const cookieDomain = process.env.COOKIE_DOMAIN ?? "localhost";
  const server = createAuthServer();
  server.listen(port, "0.0.0.0", () => {
    console.log(`SSO Kit auth app listening on ${authOrigin}`);
    console.log(`Cookie domain: ${cookieDomain}; trusted origins: ${authOrigin}, ${chatOrigin}`);
  });
}
