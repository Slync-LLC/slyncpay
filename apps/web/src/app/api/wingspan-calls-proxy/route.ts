import { NextRequest, NextResponse } from "next/server";
import { apiServerFetch } from "@/lib/api-server";

export async function GET(req: NextRequest) {
  const qs = req.nextUrl.search;
  const upstream = await apiServerFetch(`/v1/tenant/activity-log/wingspan-calls${qs}`);
  const body = await upstream.text();
  return new NextResponse(body, {
    status: upstream.status,
    headers: { "Content-Type": "application/json" },
  });
}
