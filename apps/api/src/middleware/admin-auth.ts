import type { Context, Next } from "hono";
import { verifyAdminSession } from "../lib/sessions.js";
import { UnauthorizedError } from "../lib/errors.js";

export interface AdminAuthContext {
  adminId: string;
  email: string;
  name: string;
  jti: string;
}

declare module "hono" {
  interface ContextVariableMap {
    admin: AdminAuthContext;
  }
}

export async function adminAuthMiddleware(c: Context, next: Next): Promise<void> {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new UnauthorizedError("Missing or invalid Authorization header");
  }

  const token = authHeader.slice(7);

  try {
    const claims = await verifyAdminSession(token);
    c.set("admin", { adminId: claims.adminId, email: claims.email, name: claims.name, jti: claims.jti });
    await next();
  } catch {
    throw new UnauthorizedError("Invalid or expired admin session");
  }
}
