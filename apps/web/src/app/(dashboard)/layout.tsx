"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { cn } from "@/lib/utils";
import { Providers } from "@/components/providers";
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

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <aside className="w-56 border-r border-border flex flex-col bg-white">
        {/* Logo */}
        <div className="px-4 py-5 border-b border-border">
          <Link href="/dashboard" className="font-bold text-lg tracking-tight">
            SlyncPay
          </Link>
        </div>

        {/* Nav */}
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

        {/* User + Settings */}
        <div className="p-3 border-t border-border flex items-center justify-between">
          <UserButton afterSignOutUrl="/" />
          <Link href="/dashboard/settings" className="text-muted-foreground hover:text-foreground">
            <Settings className="h-4 w-4" />
          </Link>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        <Providers>{children}</Providers>
      </main>
    </div>
  );
}
