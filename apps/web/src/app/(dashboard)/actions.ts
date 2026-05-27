"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

const MODE_COOKIE = "__slyncpay_mode";

export async function setMode(mode: "live" | "test"): Promise<void> {
  if (mode !== "live" && mode !== "test") return;

  cookies().set(MODE_COOKIE, mode, {
    httpOnly: false, // readable by client JS for instant UI feedback
    secure: process.env["NODE_ENV"] === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365, // 1 year
    path: "/",
  });

  revalidatePath("/dashboard");
}
