"use client";

import { usePathname } from "next/navigation";

// Subtle fade-in on route change (design-system §7: 150–200ms ease-out, motion
// budget respected). Keyed on pathname so it re-triggers per navigation;
// motion-safe means prefers-reduced-motion users get no animation.
export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div
      key={pathname}
      className="motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200 motion-safe:ease-out"
    >
      {children}
    </div>
  );
}
