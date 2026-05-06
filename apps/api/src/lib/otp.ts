import bcrypt from "bcrypt";
import { randomInt } from "crypto";
import { db, emailOtpCodes, eq, and, isNull, sql } from "@slyncpay/db";
import { sendEmail, otpEmail } from "./email.js";

const OTP_LENGTH = 6;
const OTP_TTL_SECONDS = 5 * 60;
const MAX_VERIFY_ATTEMPTS = 5;

export type OtpPurpose = "login_2fa" | "setup_2fa";
export type OtpIdentifierType = "tenant" | "admin";

function generateCode(): string {
  // randomInt is cryptographically secure
  let code = "";
  for (let i = 0; i < OTP_LENGTH; i++) {
    code += randomInt(0, 10).toString();
  }
  return code;
}

export async function issueOtp(opts: {
  identifier: string;
  identifierType: OtpIdentifierType;
  purpose: OtpPurpose;
  email: string;
  ipAddress?: string | undefined;
}): Promise<{ delivered: boolean; channel: "resend" | "log" }> {
  // Invalidate any prior unused codes for this (identifier, purpose) combo
  await db
    .update(emailOtpCodes)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(emailOtpCodes.identifier, opts.identifier),
        eq(emailOtpCodes.identifierType, opts.identifierType),
        eq(emailOtpCodes.purpose, opts.purpose),
        isNull(emailOtpCodes.usedAt),
      ),
    );

  const code = generateCode();
  const codeHash = await bcrypt.hash(code, 10);
  const expiresAt = new Date(Date.now() + OTP_TTL_SECONDS * 1000);

  await db.insert(emailOtpCodes).values({
    identifier: opts.identifier,
    identifierType: opts.identifierType,
    purpose: opts.purpose,
    codeHash,
    expiresAt,
    ipAddress: opts.ipAddress ?? null,
  });

  return sendEmail(otpEmail(opts.email, code, opts.purpose === "setup_2fa" ? "setup" : "login"));
}

export async function verifyOtp(opts: {
  identifier: string;
  identifierType: OtpIdentifierType;
  purpose: OtpPurpose;
  code: string;
}): Promise<{ ok: boolean; error?: "expired" | "invalid" | "exhausted" | "not_found" }> {
  const [row] = await db
    .select()
    .from(emailOtpCodes)
    .where(
      and(
        eq(emailOtpCodes.identifier, opts.identifier),
        eq(emailOtpCodes.identifierType, opts.identifierType),
        eq(emailOtpCodes.purpose, opts.purpose),
        isNull(emailOtpCodes.usedAt),
      ),
    )
    .orderBy(sql`${emailOtpCodes.createdAt} DESC`)
    .limit(1);

  if (!row) return { ok: false, error: "not_found" };

  if (row.expiresAt < new Date()) {
    await db.update(emailOtpCodes).set({ usedAt: new Date() }).where(eq(emailOtpCodes.id, row.id));
    return { ok: false, error: "expired" };
  }

  if (row.attempts >= MAX_VERIFY_ATTEMPTS) {
    await db.update(emailOtpCodes).set({ usedAt: new Date() }).where(eq(emailOtpCodes.id, row.id));
    return { ok: false, error: "exhausted" };
  }

  const valid = await bcrypt.compare(opts.code, row.codeHash);

  if (!valid) {
    await db
      .update(emailOtpCodes)
      .set({ attempts: row.attempts + 1 })
      .where(eq(emailOtpCodes.id, row.id));
    return { ok: false, error: "invalid" };
  }

  await db.update(emailOtpCodes).set({ usedAt: new Date() }).where(eq(emailOtpCodes.id, row.id));
  return { ok: true };
}
