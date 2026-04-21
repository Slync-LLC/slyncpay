import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

const PUBLIC_PATHS = ["/", "/pricing", "/how-it-works", "/sign-in", "/sign-up", "/admin/login"];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

const secret = new TextEncoder().encode(process.env["JWT_SECRET"] ?? "");

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

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
