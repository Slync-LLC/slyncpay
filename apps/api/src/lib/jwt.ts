import { SignJWT, jwtVerify } from "jose";
import { env } from "./env.js";

const secret = new TextEncoder().encode(env.JWT_SECRET);

export interface SessionPayload {
  sub: string;
  tenantId: string;
  email: string;
  name: string;
}

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret);
}

export async function verifySession(token: string): Promise<SessionPayload> {
  const { payload } = await jwtVerify(token, secret);
  return payload as unknown as SessionPayload;
}

export interface AdminSessionPayload {
  sub: string;
  adminId: string;
  email: string;
  name: string;
  role: "admin";
}

export async function signAdminSession(payload: Omit<AdminSessionPayload, "role">): Promise<string> {
  return new SignJWT({ ...payload, role: "admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("12h")
    .sign(secret);
}

export async function verifyAdminSession(token: string): Promise<AdminSessionPayload> {
  const { payload } = await jwtVerify(token, secret);
  const p = payload as unknown as AdminSessionPayload;
  if (p.role !== "admin") throw new Error("Not an admin token");
  return p;
}
