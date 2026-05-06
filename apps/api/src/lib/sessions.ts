import { randomUUID } from "crypto";
import { SignJWT, jwtVerify } from "jose";
import { db, sessions, eq, and, isNull } from "@slyncpay/db";
import { env } from "./env.js";

const secret = new TextEncoder().encode(env.JWT_SECRET);

export type SubjectType = "tenant" | "admin";
export type Audience = "tenant-session" | "admin-session" | "otp-challenge";

const ISSUER = "slyncpay";

interface BaseClaims {
  sub: string;
  jti: string;
  iss: string;
  aud: Audience;
  iat: number;
  exp: number;
}

export interface TenantSessionClaims extends BaseClaims {
  aud: "tenant-session";
  tenantId: string;
  email: string;
  name: string;
  impersonatorId?: string;
}

export interface AdminSessionClaims extends BaseClaims {
  aud: "admin-session";
  adminId: string;
  email: string;
  name: string;
  role: "admin";
}

export interface OtpChallengeClaims extends BaseClaims {
  aud: "otp-challenge";
  subjectType: SubjectType;
  email: string;
}

interface CreateSessionOpts {
  subjectId: string;
  subjectType: SubjectType;
  ttlSeconds: number;
  ipAddress?: string | undefined;
  userAgent?: string | undefined;
  impersonatorId?: string | undefined;
}

export interface SessionMeta {
  ipAddress?: string | undefined;
  userAgent?: string | undefined;
}

/** Persists a session row and returns the JWT id (jti). */
async function persistSession(opts: CreateSessionOpts): Promise<string> {
  const jti = randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + opts.ttlSeconds * 1000);

  await db.insert(sessions).values({
    id: jti,
    subjectId: opts.subjectId,
    subjectType: opts.subjectType,
    ipAddress: opts.ipAddress ?? null,
    userAgent: opts.userAgent ?? null,
    expiresAt,
    impersonatorId: opts.impersonatorId ?? null,
  });

  return jti;
}

export async function createTenantSession(
  payload: { tenantId: string; email: string; name: string; impersonatorId?: string },
  ttlSeconds: number,
  meta: SessionMeta = {},
): Promise<string> {
  const jti = await persistSession({
    subjectId: payload.tenantId,
    subjectType: "tenant",
    ttlSeconds,
    impersonatorId: payload.impersonatorId,
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });

  const jwt = await new SignJWT({
    tenantId: payload.tenantId,
    email: payload.email,
    name: payload.name,
    ...(payload.impersonatorId ? { impersonatorId: payload.impersonatorId } : {}),
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.tenantId)
    .setIssuer(ISSUER)
    .setAudience("tenant-session")
    .setJti(jti)
    .setIssuedAt()
    .setExpirationTime(`${ttlSeconds}s`)
    .sign(secret);

  return jwt;
}

export async function createAdminSession(
  payload: { adminId: string; email: string; name: string },
  ttlSeconds: number,
  meta: SessionMeta = {},
): Promise<string> {
  const jti = await persistSession({
    subjectId: payload.adminId,
    subjectType: "admin",
    ttlSeconds,
    ...meta,
  });

  const jwt = await new SignJWT({
    adminId: payload.adminId,
    email: payload.email,
    name: payload.name,
    role: "admin",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.adminId)
    .setIssuer(ISSUER)
    .setAudience("admin-session")
    .setJti(jti)
    .setIssuedAt()
    .setExpirationTime(`${ttlSeconds}s`)
    .sign(secret);

  return jwt;
}

/** OTP challenge tokens are NOT persisted in the sessions table — they're short-lived state. */
export async function createOtpChallenge(payload: {
  subjectId: string;
  subjectType: SubjectType;
  email: string;
}): Promise<string> {
  return new SignJWT({
    subjectType: payload.subjectType,
    email: payload.email,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.subjectId)
    .setIssuer(ISSUER)
    .setAudience("otp-challenge")
    .setJti(randomUUID())
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(secret);
}

async function verifyJwt<T extends BaseClaims>(token: string, audience: Audience): Promise<T> {
  const { payload } = await jwtVerify(token, secret, {
    issuer: ISSUER,
    audience,
  });
  return payload as unknown as T;
}

/** Verifies tenant session JWT AND that the session row is not revoked/expired. */
export async function verifyTenantSession(token: string): Promise<TenantSessionClaims> {
  const claims = await verifyJwt<TenantSessionClaims>(token, "tenant-session");
  await assertSessionLive(claims.jti, "tenant");
  return claims;
}

export async function verifyAdminSession(token: string): Promise<AdminSessionClaims> {
  const claims = await verifyJwt<AdminSessionClaims>(token, "admin-session");
  if (claims.role !== "admin") throw new Error("not_admin");
  await assertSessionLive(claims.jti, "admin");
  return claims;
}

export async function verifyOtpChallenge(token: string): Promise<OtpChallengeClaims> {
  return verifyJwt<OtpChallengeClaims>(token, "otp-challenge");
}

async function assertSessionLive(jti: string, expectedType: SubjectType): Promise<void> {
  const [row] = await db
    .select({
      id: sessions.id,
      subjectType: sessions.subjectType,
      expiresAt: sessions.expiresAt,
      revokedAt: sessions.revokedAt,
    })
    .from(sessions)
    .where(eq(sessions.id, jti))
    .limit(1);

  if (!row) throw new Error("session_not_found");
  if (row.subjectType !== expectedType) throw new Error("session_type_mismatch");
  if (row.revokedAt) throw new Error("session_revoked");
  if (row.expiresAt < new Date()) throw new Error("session_expired");

  // Fire-and-forget last-used update
  void db.update(sessions).set({ lastUsedAt: new Date() }).where(eq(sessions.id, jti)).catch(() => {});
}

export async function revokeSession(jti: string): Promise<void> {
  await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, jti));
}

export async function revokeAllSessionsFor(subjectId: string, subjectType: SubjectType): Promise<void> {
  await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.subjectId, subjectId), eq(sessions.subjectType, subjectType), isNull(sessions.revokedAt)));
}
