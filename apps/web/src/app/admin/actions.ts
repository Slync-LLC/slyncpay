"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const API_URL = process.env["API_URL"] ?? "https://slyncpay-api.onrender.com";

const ADMIN_COOKIE = "__slyncpay_admin_session";
const ADMIN_CHALLENGE_COOKIE = "__slyncpay_admin_2fa_challenge";
const SESSION_COOKIE = "__slyncpay_session";
const IMPERSONATING_COOKIE = "__slyncpay_impersonating";

const ADMIN_COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env["NODE_ENV"] === "production",
  sameSite: "strict" as const, // admin doesn't need cross-site nav
  maxAge: 60 * 60 * 12,
  path: "/",
};

const CHALLENGE_COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env["NODE_ENV"] === "production",
  sameSite: "strict" as const,
  maxAge: 60 * 10,
  path: "/",
};

const TENANT_COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env["NODE_ENV"] === "production",
  sameSite: "lax" as const,
  maxAge: 60 * 60 * 24 * 7,
  path: "/",
};

export async function adminLogin(_prev: { error?: string } | null, formData: FormData) {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  let res: Response;
  try {
    res = await fetch(`${API_URL}/v1/admin/login`, {
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

  if (body.challenge === "2fa_required" && body.challengeToken) {
    cookies().set(ADMIN_CHALLENGE_COOKIE, body.challengeToken, CHALLENGE_COOKIE_OPTS);
    redirect(`/admin/two-factor${body.emailDelivered === false ? "?dev=1" : ""}`);
  }

  if (!body.token) return { error: "Unexpected server response." };
  cookies().set(ADMIN_COOKIE, body.token, ADMIN_COOKIE_OPTS);
  redirect("/admin");
}

export async function adminVerifyOtp(_prev: { error?: string } | null, formData: FormData) {
  const code = formData.get("code") as string;
  const challengeToken = cookies().get(ADMIN_CHALLENGE_COOKIE)?.value;

  if (!challengeToken) {
    return { error: "Your verification session expired. Please sign in again." };
  }

  let res: Response;
  try {
    res = await fetch(`${API_URL}/v1/admin/login/verify`, {
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

  cookies().delete(ADMIN_CHALLENGE_COOKIE);
  cookies().set(ADMIN_COOKIE, body.token, ADMIN_COOKIE_OPTS);
  redirect("/admin");
}

export async function adminSignOut() {
  const token = cookies().get(ADMIN_COOKIE)?.value;
  cookies().delete(ADMIN_COOKIE);
  cookies().delete(SESSION_COOKIE);
  cookies().delete(IMPERSONATING_COOKIE);
  cookies().delete(ADMIN_CHALLENGE_COOKIE);

  if (token) {
    void fetch(`${API_URL}/v1/admin/logout`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => {});
  }

  redirect("/admin/login");
}

export async function impersonateTenant(tenantId: string, tenantName: string) {
  const adminToken = cookies().get(ADMIN_COOKIE)?.value;
  if (!adminToken) redirect("/admin/login");

  const res = await fetch(`${API_URL}/v1/admin/tenants/${tenantId}/impersonate`, {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}` },
  });

  if (!res.ok) throw new Error("Failed to impersonate tenant");

  const { token } = (await res.json()) as { token: string };

  cookies().set(SESSION_COOKIE, token, TENANT_COOKIE_OPTS);
  cookies().set(IMPERSONATING_COOKIE, tenantName, {
    httpOnly: false, // readable by client for banner
    secure: process.env["NODE_ENV"] === "production",
    sameSite: "lax" as const,
    maxAge: 60 * 60 * 4,
    path: "/",
  });

  redirect("/dashboard");
}

export async function exitImpersonation() {
  cookies().delete(SESSION_COOKIE);
  cookies().delete(IMPERSONATING_COOKIE);
  redirect("/admin/tenants");
}

export async function updateTenantStatus(tenantId: string, status: "active" | "suspended" | "cancelled") {
  const adminToken = cookies().get(ADMIN_COOKIE)?.value;
  if (!adminToken) redirect("/admin/login");

  const res = await fetch(`${API_URL}/v1/admin/tenants/${tenantId}/status`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({ status }),
  });

  if (!res.ok) throw new Error("Failed to update tenant status");
}

export async function deleteTenant(tenantId: string): Promise<{ error?: string }> {
  const adminToken = cookies().get(ADMIN_COOKIE)?.value;
  if (!adminToken) redirect("/admin/login");

  const res = await fetch(`${API_URL}/v1/admin/tenants/${tenantId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${adminToken}` },
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    return { error: body.message ?? "Failed to delete tenant" };
  }

  redirect("/admin/tenants");
}
