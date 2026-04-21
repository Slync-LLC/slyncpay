"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { adminSignOut } from "./actions";
import { LayoutDashboard, Users, Shield, LogOut } from "lucide-react";

const navItems = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/admin/tenants", label: "Tenants", icon: Users },
];

interface Props {
  email: string;
  name: string;
  children: React.ReactNode;
}

export function AdminLayoutClient({ email, name, children }: Props) {
  const pathname = usePathname();
  const initial = (name || email).charAt(0).toUpperCase();

  // Don't show chrome on the login page
  if (pathname === "/admin/login") {
    return <>{children}</>;
  }

  return (
    <div className="flex h-screen bg-background">
      <aside className="w-56 border-r border-border flex flex-col bg-white">
        <div className="px-4 py-5 border-b border-border flex items-center gap-2">
          <Shield className="h-4 w-4 text-primary" />
          <Link href="/admin" className="font-bold text-sm tracking-tight">
            SlyncPay Admin
          </Link>
        </div>

        <nav className="flex-1 overflow-y-auto p-3 space-y-0.5">
          {navItems.map(({ href, label, icon: Icon, exact }) => {
            const active = exact ? pathname === href : pathname === href || pathname.startsWith(href + "/");
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors",
                  active
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted",
                )}
              >
                <Icon className="h-4 w-4 flex-shrink-0" />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="p-3 border-t border-border space-y-2">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <span className="text-xs font-semibold text-primary">{initial}</span>
            </div>
            <div className="flex-1 min-w-0">
              {name && <div className="text-xs font-medium truncate">{name}</div>}
              <div className="text-xs text-muted-foreground truncate">{email}</div>
            </div>
          </div>
          <form action={adminSignOut}>
            <button
              type="submit"
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground w-full px-1"
            >
              <LogOut className="h-3 w-3" />
              Sign out
            </button>
          </form>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
