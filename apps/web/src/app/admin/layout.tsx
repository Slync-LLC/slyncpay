import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import { AdminLayoutClient } from "./layout-client";

const secret = new TextEncoder().encode(process.env["JWT_SECRET"] ?? "");

async function getAdminSession() {
  const token = cookies().get("__slyncpay_admin_session")?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret);
    if (payload["role"] !== "admin") return null;
    return { email: (payload["email"] as string) ?? "", name: (payload["name"] as string) ?? "" };
  } catch {
    return null;
  }
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getAdminSession();
  return (
    <AdminLayoutClient email={session?.email ?? ""} name={session?.name ?? ""}>
      {children}
    </AdminLayoutClient>
  );
}
