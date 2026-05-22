import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

const PUBLIC_PATHS = [
  "/",
  "/pricing",
  "/how-it-works",
  "/sign-in",
  "/sign-up",
  "/two-factor",
  "/gate",
  "/admin/login",
  "/admin/two-factor",
];

const GATE_BYPASS_PATHS = ["/gate", "/admin"]; // admin has its own auth; gate page must always be reachable

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

function bypassesGate(pathname: string): boolean {
  return GATE_BYPASS_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

const secret = new TextEncoder().encode(process.env["JWT_SECRET"] ?? "");

async function hasValidGateCookie(req: NextRequest): Promise<boolean> {
  const token = req.cookies.get("__slyncpay_gate")?.value;
  if (!token) return false;
  try {
    await jwtVerify(token, secret, { issuer: "slyncpay", audience: "site-gate" });
    return true;
  } catch {
    return false;
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Gate everything except /gate itself, /admin/* (own auth), and /api/* (excluded by matcher)
  if (!bypassesGate(pathname)) {
    const ok = await hasValidGateCookie(req);
    if (!ok) {
      const redirectUrl = new URL("/gate", req.url);
      redirectUrl.searchParams.set("next", pathname + req.nextUrl.search);
      return NextResponse.redirect(redirectUrl);
    }
  }

  if (isPublic(pathname)) return NextResponse.next();

  // Admin routes: require admin JWT with role=admin
  if (pathname.startsWith("/admin")) {
    const token = req.cookies.get("__slyncpay_admin_session")?.value;
    if (!token) return NextResponse.redirect(new URL("/admin/login", req.url));

    try {
      const { payload } = await jwtVerify(token, secret);
      if (payload["role"] !== "admin") throw new Error("Not admin");
      return NextResponse.next();
    } catch {
      const res = NextResponse.redirect(new URL("/admin/login", req.url));
      res.cookies.delete("__slyncpay_admin_session");
      return res;
    }
  }

  // Tenant dashboard routes: require tenant session JWT
  const token = req.cookies.get("__slyncpay_session")?.value;
  if (!token) return NextResponse.redirect(new URL("/sign-in", req.url));

  try {
    await jwtVerify(token, secret);
    return NextResponse.next();
  } catch {
    const res = NextResponse.redirect(new URL("/sign-in", req.url));
    res.cookies.delete("__slyncpay_session");
    return res;
  }
}

export const config = {
  matcher: ["/((?!.+\\.[\\w]+$|_next|api).*)"],
};
