"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

const MODE_COOKIE = "__slyncpay_mode";

// Sections that have per-resource detail pages. When the user switches modes
// from one of these detail pages, the resource almost certainly won't exist
// in the other env, so we send them to the section's list page instead of
// staying on a URL that 404s.
const SECTION_LIST_PATHS = [
  "/dashboard/workers",
  "/dashboard/entities",
  "/dashboard/payables",
  "/dashboard/disbursements",
];

export async function setMode(mode: "live" | "test", currentPath?: string): Promise<void> {
  if (mode !== "live" && mode !== "test") return;

  cookies().set(MODE_COOKIE, mode, {
    httpOnly: false, // readable by client JS for instant UI feedback
    secure: process.env["NODE_ENV"] === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365, // 1 year
    path: "/",
  });

  // Revalidate the whole dashboard tree (every page reads env-scoped data).
  revalidatePath("/dashboard", "layout");

  // If we're on a per-resource detail page, redirect to that section's list.
  // E.g. /dashboard/entities/<sandbox-id> in sandbox → switching to live
  // would 404; send to /dashboard/entities instead.
  if (currentPath) {
    for (const section of SECTION_LIST_PATHS) {
      if (currentPath.startsWith(`${section}/`) && currentPath !== section) {
        redirect(section);
      }
    }
  }
}
