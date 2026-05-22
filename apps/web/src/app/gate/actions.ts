"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT } from "jose";
import { timingSafeEqual } from "crypto";

const GATE_COOKIE = "__slyncpay_gate";
const ISSUER = "slyncpay";
const AUDIENCE = "site-gate";

function constantTimeEqual(a: string, b: string): boolean {
  // Both buffers must be same length; pad to avoid length-based timing leak
  const max = Math.max(a.length, b.length);
  const ba = Buffer.from(a.padEnd(max, "\0"));
  const bb = Buffer.from(b.padEnd(max, "\0"));
  return ba.length === bb.length && timingSafeEqual(ba, bb) && a.length === b.length;
}

export async function submitGate(
  _prev: { error?: string } | null,
  formData: FormData,
): Promise<{ error?: string } | void> {
  const password = (formData.get("password") as string) ?? "";
  const expected = process.env["SITE_GATE_PASSWORD"];
  const next = (formData.get("next") as string) || "/";

  if (!expected) {
    return { error: "Gate not configured. Contact the administrator." };
  }
  if (!constantTimeEqual(password, expected)) {
    return { error: "Incorrect password." };
  }

  const secret = new TextEncoder().encode(process.env["JWT_SECRET"] ?? "");
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret);

  cookies().set(GATE_COOKIE, token, {
    httpOnly: true,
    secure: process.env["NODE_ENV"] === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });

  // Redirect back to wherever the user was headed. Only allow same-origin paths.
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/";
  redirect(safeNext);
}
