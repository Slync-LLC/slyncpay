"use server";

import { apiServerFetch, apiServerJson, ServerApiError } from "@/lib/api-server";

interface CreatePayrollInput {
  entityId: string;
  type: "regular" | "off_cycle";
  periodStart: string;
  periodEnd: string;
  payDate: string;
}

export async function createPayroll(
  input: CreatePayrollInput,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  try {
    const res = await apiServerJson<{ id: string }>("/v1/payrolls", input);
    return { ok: true, id: res.id };
  } catch (err) {
    if (err instanceof ServerApiError) return { ok: false, error: err.message };
    return { ok: false, error: "Network error" };
  }
}

export async function previewPayroll(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await apiServerFetch(`/v1/payrolls/${id}/preview`, { method: "POST" });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { message?: string };
      return { ok: false, error: body.message ?? "Preview failed" };
    }
    return { ok: true };
  } catch (err) {
    if (err instanceof ServerApiError) return { ok: false, error: err.message };
    return { ok: false, error: "Network error" };
  }
}

export async function approvePayroll(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await apiServerFetch(`/v1/payrolls/${id}/approve`, { method: "POST" });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { message?: string };
      return { ok: false, error: body.message ?? "Approve failed" };
    }
    return { ok: true };
  } catch (err) {
    if (err instanceof ServerApiError) return { ok: false, error: err.message };
    return { ok: false, error: "Network error" };
  }
}
