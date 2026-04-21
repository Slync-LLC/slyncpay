"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const API_URL = process.env["API_URL"] ?? "https://slyncpay-api.onrender.com";

const ADMIN_COOKIE = "__slyncpay_admin_session";
const SESSION_COOKIE = "__slyncpay_session";
const IMPERSONATING_COOKIE = "__slyncpay_impersonating";

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env["NODE_ENV"] === "production",
  sameSite: "lax" as const,
  maxAge: 60 * 60 * 12, // 12 hours
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

  if (!res.ok) {
    return { error: "Invalid email or password." };
  }

  const { token } = (await res.json()) as { token: string };
  cookies().set(ADMIN_COOKIE, token, COOKIE_OPTIONS);
  redirect("/admin/tenants");
}

export async function adminSignOut() {
  cookies().delete(ADMIN_COOKIE);
  cookies().delete(SESSION_COOKIE);
  cookies().delete(IMPERSONATING_COOKIE);
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

  cookies().set(SESSION_COOKIE, token, {
    ...COOKIE_OPTIONS,
    maxAge: 60 * 60 * 24 * 7,
  });
  cookies().set(IMPERSONATING_COOKIE, tenantName, {
    httpOnly: false, // readable by client for banner
    secure: process.env["NODE_ENV"] === "production",
    sameSite: "lax" as const,
    maxAge: 60 * 60 * 24 * 7,
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
