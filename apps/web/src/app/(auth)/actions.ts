"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const API_URL = process.env["API_URL"] ?? "https://slyncpay-api.onrender.com";

const SESSION_COOKIE = "__slyncpay_session";
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env["NODE_ENV"] === "production",
  sameSite: "lax" as const,
  maxAge: 60 * 60 * 24 * 7,
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

  if (!res.ok) {
    return { error: "Invalid email or password." };
  }

  const { token } = (await res.json()) as { token: string };
  cookies().set(SESSION_COOKIE, token, COOKIE_OPTIONS);
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
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    return { error: body.message ?? "Failed to create account." };
  }

  const { token } = (await res.json()) as { token: string };
  cookies().set(SESSION_COOKIE, token, COOKIE_OPTIONS);
  redirect("/dashboard");
}

export async function signOut() {
  cookies().delete(SESSION_COOKIE);
  redirect("/sign-in");
}
