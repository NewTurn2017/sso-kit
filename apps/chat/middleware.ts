import { NextResponse, type NextRequest } from "next/server";

const authOrigin = process.env.AUTH_ORIGIN ?? "http://auth.lvh.me:3000";
const chatOrigin = process.env.CHAT_ORIGIN;
const chatProtocol = process.env.CHAT_PROTOCOL ?? "http";
const defaultChatOrigin = "http://chat.lvh.me:3001";

function publicChatOrigin(request: NextRequest) {
  if (chatOrigin) return new URL(chatOrigin).origin;

  const host = request.headers.get("host");
  if (host) return `${chatProtocol}://${host}`;

  return defaultChatOrigin;
}

function currentPublicUrl(request: NextRequest) {
  return new URL(
    `${request.nextUrl.pathname}${request.nextUrl.search}`,
    publicChatOrigin(request)
  ).toString();
}

export async function middleware(request: NextRequest) {
  if (!request.nextUrl.pathname.startsWith("/protected")) {
    return NextResponse.next();
  }

  const sessionUrl = new URL("/api/auth/get-session", publicChatOrigin(request));
  const response = await fetch(sessionUrl, {
    headers: { cookie: request.headers.get("cookie") ?? "" },
    cache: "no-store",
  }).catch(() => null);
  const session = response ? await response.json().catch(() => null) : null;

  if (session?.user) {
    return NextResponse.next();
  }

  const loginUrl = new URL("/login", authOrigin);
  loginUrl.searchParams.set("redirect", currentPublicUrl(request));
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/protected/:path*"],
};
