import { createServer } from "node:http";
import { randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { pathToFileURL } from "node:url";

const port = Number(process.env.BACKEND_PORT ?? 3999);

function json(res, status, body) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return Object.fromEntries(new URLSearchParams(raw));
  }
}

function hashPassword(password, salt = randomUUID()) {
  return `${salt}:${scryptSync(password, salt, 32).toString("hex")}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(":");
  const actual = scryptSync(password, salt, 32);
  return timingSafeEqual(Buffer.from(hash, "hex"), actual);
}

export function createBackendHandler({ users = new Map(), sessions = new Map() } = {}) {
  function createSession(email) {
    const token = randomUUID();
    sessions.set(token, { email, createdAt: new Date().toISOString() });
    return token;
  }

  return async (req, res) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

    if (req.method === "GET" && url.pathname === "/health") {
      return json(res, 200, { ok: true, users: users.size, sessions: sessions.size });
    }

    if (req.method === "POST" && url.pathname === "/signup") {
      const body = await readBody(req);
      if (!body.email || !body.password) return json(res, 400, { error: "email and password required" });
      const email = String(body.email).toLowerCase();
      if (!users.has(email)) users.set(email, { email, passwordHash: hashPassword(String(body.password)) });
      const token = createSession(email);
      return json(res, 200, { token, user: { email } });
    }

    if (req.method === "POST" && url.pathname === "/login") {
      const body = await readBody(req);
      const email = String(body.email ?? "").toLowerCase();
      const user = users.get(email);
      if (!user || !verifyPassword(String(body.password ?? ""), user.passwordHash)) {
        return json(res, 401, { error: "invalid credentials" });
      }
      const token = createSession(email);
      return json(res, 200, { token, user: { email } });
    }

    if (req.method === "GET" && url.pathname === "/session") {
      const token = url.searchParams.get("token") ?? "";
      const session = sessions.get(token);
      return json(res, 200, { user: session ? { email: session.email } : null });
    }

    if (req.method === "POST" && url.pathname === "/logout") {
      const body = await readBody(req);
      sessions.delete(String(body.token ?? ""));
      return json(res, 200, { ok: true });
    }

    return json(res, 404, { error: "not found" });
  };
}

export function createBackendServer(options = {}) {
  return createServer(createBackendHandler(options));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = createBackendServer();
  server.listen(port, "127.0.0.1", () => {
    console.log(`SSO Kit PoC central session backend listening on http://127.0.0.1:${port}`);
  });
}
