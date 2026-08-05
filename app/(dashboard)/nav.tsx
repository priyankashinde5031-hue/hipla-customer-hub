"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Sidebar nav (spec §1): Dashboard · Customers · Renewals · Implementations ·
// Usage · Invoices · Settings. Client component so the active route is
// highlighted. "Customers" is the Organizations list (a customer = an Org/HQ).
const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/organizations", label: "Customers" },
  { href: "/renewals", label: "Renewals" },
  { href: "/implementations", label: "Implementations" },
  { href: "/usage", label: "Usage" },
  { href: "/invoices", label: "Invoices" },
  { href: "/revenue", label: "Revenue" },
  { href: "/settings", label: "Settings" },
];

export function SidebarNav() {
  const pathname = usePathname();

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <nav className="mt-8 flex flex-col gap-1">
      {NAV.map((item) => {
        const active = isActive(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`rounded-md px-2 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50 focus-visible:ring-offset-2 ${
              active
                ? "bg-indigo-50 font-medium text-indigo-700"
                : "text-slate-600 hover:bg-slate-100 hover:text-gray-900"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
