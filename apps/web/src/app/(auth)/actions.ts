"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const API_URL = process.env["API_URL"] ?? "https://slyncpay-api.onrender.com";

const SESSION_COOKIE = "__slyncpay_session";
const CHALLENGE_COOKIE = "__slyncpay_2fa_challenge";

const SESSION_COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env["NODE_ENV"] === "production",
  sameSite: "lax" as const,
  maxAge: 60 * 60 * 24 * 7,
  path: "/",
};

const CHALLENGE_COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env["NODE_ENV"] === "production",
  sameSite: "lax" as const,
  maxAge: 60 * 10, // 10 min
  path: "/",
};

export async function login(_prev: { error?: string } | null, formData: FormData) {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  let res: Response;
  try {
    res = await fetch(`${API_URL}/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
  } catch {
    return { error: "Could not reach the server. Please try again." };
  }

  const body = (await res.json().catch(() => ({}))) as {
    token?: string;
    challenge?: string;
    challengeToken?: string;
    emailDelivered?: boolean;
    error?: string;
    message?: string;
  };

  if (res.status === 429) return { error: body.message ?? "Too many attempts. Please wait." };
  if (!res.ok && body.challenge !== "2fa_required") {
    return { error: body.message ?? "Invalid email or password." };
  }

  // 2FA challenge
  if (body.challenge === "2fa_required" && body.challengeToken) {
    cookies().set(CHALLENGE_COOKIE, body.challengeToken, CHALLENGE_COOKIE_OPTS);
    redirect(`/two-factor${body.emailDelivered === false ? "?dev=1" : ""}`);
  }

  if (!body.token) return { error: "Unexpected server response." };
  cookies().set(SESSION_COOKIE, body.token, SESSION_COOKIE_OPTS);
  redirect("/dashboard");
}

export async function verifyLoginOtp(_prev: { error?: string } | null, formData: FormData) {
  const code = formData.get("code") as string;
  const challengeToken = cookies().get(CHALLENGE_COOKIE)?.value;

  if (!challengeToken) {
    return { error: "Your verification session expired. Please sign in again." };
  }

  let res: Response;
  try {
    res = await fetch(`${API_URL}/v1/auth/login/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ challengeToken, code }),
    });
  } catch {
    return { error: "Could not reach the server. Please try again." };
  }

  const body = (await res.json().catch(() => ({}))) as { token?: string; message?: string };

  if (!res.ok || !body.token) {
    return { error: body.message ?? "Invalid or expired verification code." };
  }

  cookies().delete(CHALLENGE_COOKIE);
  cookies().set(SESSION_COOKIE, body.token, SESSION_COOKIE_OPTS);
  redirect("/dashboard");
}

export async function signUp(_prev: { error?: string } | null, formData: FormData) {
  const name = formData.get("name") as string;
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const companyName = formData.get("companyName") as string;

  let res: Response;
  try {
    res = await fetch(`${API_URL}/v1/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password, companyName }),
    });
  } catch {
    return { error: "Could not reach the server. Please try again." };
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string; details?: string[] };
    if (body.details && Array.isArray(body.details)) {
      return { error: body.details.join(". ") };
    }
    return { error: body.message ?? "Failed to create account." };
  }

  const { token } = (await res.json()) as { token: string };
  cookies().set(SESSION_COOKIE, token, SESSION_COOKIE_OPTS);
  redirect("/dashboard");
}

export async function signOut() {
  const token = cookies().get(SESSION_COOKIE)?.value;
  cookies().delete(SESSION_COOKIE);
  cookies().delete("__slyncpay_impersonating");

  // Best-effort server-side revocation
  if (token) {
    void fetch(`${API_URL}/v1/auth/logout`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => {});
  }

  redirect("/sign-in");
}
