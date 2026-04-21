import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import { DashboardLayoutClient } from "./layout-client";

const secret = new TextEncoder().encode(process.env["JWT_SECRET"] ?? "");

async function getSession() {
  const token = cookies().get("__slyncpay_session")?.value;
  if (!token) return { email: "", name: "" };
  try {
    const { payload } = await jwtVerify(token, secret);
    return {
      email: (payload["email"] as string) ?? "",
      name: (payload["name"] as string) ?? "",
    };
  } catch {
    return { email: "", name: "" };
  }
}

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  const impersonating = cookies().get("__slyncpay_impersonating")?.value;
  return (
    <DashboardLayoutClient email={session.email} name={session.name} impersonating={impersonating}>
      {children}
    </DashboardLayoutClient>
  );
}
