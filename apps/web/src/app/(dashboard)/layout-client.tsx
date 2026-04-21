"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Providers } from "@/components/providers";
import { signOut } from "@/app/(auth)/actions";
import {
  LayoutDashboard,
  Users,
  Building2,
  FileText,
  Banknote,
  Receipt,
  Key,
  Settings,
  Webhook,
  LogOut,
} from "lucide-react";

const navItems = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard/contractors", label: "Contractors", icon: Users },
  { href: "/dashboard/entities", label: "Entities", icon: Building2 },
  { href: "/dashboard/payables", label: "Payables", icon: FileText },
  { href: "/dashboard/disbursements", label: "Disbursements", icon: Banknote },
  { href: "/dashboard/tax", label: "1099s", icon: Receipt },
];

const developerItems = [
  { href: "/dashboard/developer/keys", label: "API Keys", icon: Key },
  { href: "/dashboard/developer/webhooks", label: "Webhooks", icon: Webhook },
];

interface Props {
  email: string;
  name: string;
  children: React.ReactNode;
}

export function DashboardLayoutClient({ email, name, children }: Props) {
  const pathname = usePathname();
  const initial = (name || email).charAt(0).toUpperCase();

  return (
    <div className="flex h-screen bg-background">
      <aside className="w-56 border-r border-border flex flex-col bg-white">
        <div className="px-4 py-5 border-b border-border">
          <Link href="/dashboard" className="font-bold text-lg tracking-tight">
            SlyncPay
          </Link>
        </div>

        <nav className="flex-1 overflow-y-auto p-3 space-y-0.5">
          {navItems.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors",
                pathname === href
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted",
              )}
            >
              <Icon className="h-4 w-4 flex-shrink-0" />
              {label}
            </Link>
          ))}

          <div className="pt-4 pb-1 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Developer
          </div>
          {developerItems.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors",
                pathname.startsWith(href)
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted",
              )}
            >
              <Icon className="h-4 w-4 flex-shrink-0" />
              {label}
            </Link>
          ))}
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
            <Link href="/dashboard/settings" className="text-muted-foreground hover:text-foreground flex-shrink-0">
              <Settings className="h-4 w-4" />
            </Link>
          </div>
          <form action={signOut}>
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

      <main className="flex-1 overflow-y-auto">
        <Providers>{children}</Providers>
      </main>
    </div>
  );
}
