import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import Link from "next/link";
import { adminSignOut } from "./actions";
import { Shield, Users, LogOut } from "lucide-react";

const secret = new TextEncoder().encode(process.env["JWT_SECRET"] ?? "");

async function getAdminSession() {
  const token = cookies().get("__slyncpay_admin_session")?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret);
    if (payload["role"] !== "admin") return null;
    return { email: payload["email"] as string, name: payload["name"] as string };
  } catch {
    return null;
  }
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getAdminSession();

  return (
    <div className="flex h-screen bg-zinc-950 text-zinc-100">
      <aside className="w-56 border-r border-zinc-800 flex flex-col bg-zinc-900">
        <div className="px-4 py-5 border-b border-zinc-800 flex items-center gap-2">
          <Shield className="h-4 w-4 text-orange-400" />
          <span className="font-bold text-sm tracking-tight">SlyncPay Admin</span>
        </div>

        <nav className="flex-1 p-3 space-y-0.5">
          <Link
            href="/admin/tenants"
            className="flex items-center gap-2.5 px-3 py-2 rounded-md text-sm text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
          >
            <Users className="h-4 w-4 flex-shrink-0" />
            Tenants
          </Link>
        </nav>

        <div className="p-3 border-t border-zinc-800">
          {session && (
            <div className="mb-2 px-1">
              <div className="text-xs font-medium text-zinc-300 truncate">{session.name}</div>
              <div className="text-xs text-zinc-500 truncate">{session.email}</div>
            </div>
          )}
          <form action={adminSignOut}>
            <button
              type="submit"
              className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 w-full px-1"
            >
              <LogOut className="h-3 w-3" />
              Sign out
            </button>
          </form>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto bg-zinc-950">{children}</main>
    </div>
  );
}
