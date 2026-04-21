import type { Context, Next } from "hono";
import { verifyAdminSession } from "../lib/jwt.js";
import { UnauthorizedError } from "../lib/errors.js";

export interface AdminAuthContext {
  adminId: string;
  email: string;
  name: string;
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
    const payload = await verifyAdminSession(token);
    c.set("admin", { adminId: payload.adminId, email: payload.email, name: payload.name });
    await next();
  } catch {
    throw new UnauthorizedError("Invalid or expired admin session");
  }
}
