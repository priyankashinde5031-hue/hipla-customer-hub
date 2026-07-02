"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export type NavSection = { id: string; label: string };

// Site status → badge colour, following the design-system status tokens
// (live = green, implementing = progress/blue, etc.).
const STATUS_BADGE: Record<string, string> = {
  live: "bg-emerald-50 text-emerald-700",
  implementing: "bg-blue-50 text-blue-700",
  prospect: "bg-slate-100 text-slate-600",
  suspended: "bg-amber-50 text-amber-700",
  churned: "bg-red-50 text-red-700",
};

// Sticky sub-header (design-system §5.7): breadcrumb + status badge + anchor
// nav with scroll-spy. Hidden at the top of the page, slides in after ~120px
// of scroll so the full page header shows at rest.
export function SiteStickyNav({
  orgName,
  orgHref,
  siteName,
  status,
  sections,
}: {
  orgName: string;
  orgHref: string;
  siteName: string;
  status: string;
  sections: NavSection[];
}) {
  const [show, setShow] = useState(false);
  const [active, setActive] = useState(sections[0]?.id ?? "");

  // One rAF-throttled scroll handler drives both the reveal (after ~120px) and
  // the scroll-spy. Active = the last section whose top has crossed just below
  // the sticky bar; at the very bottom we force the last section so the final
  // nav item is always reachable (some sections share a grid row and can't
  // scroll to the top on their own).
  // A single scroll/resize handler drives both the reveal (after ~120px) and
  // the scroll-spy. Active = the last section whose top has crossed just below
  // the sticky bar. Clicking a nav item also sets it active immediately, so
  // sections too near the page end to scroll to the top stay reachable.
  useEffect(() => {
    const OFFSET = 100; // px below the viewport top (clears the sticky bar)
    const compute = () => {
      setShow(window.scrollY > 120);
      let current = sections[0]?.id ?? "";
      for (const s of sections) {
        const el = document.getElementById(s.id);
        if (el && el.getBoundingClientRect().top <= OFFSET) current = s.id;
      }
      setActive(current);
    };
    compute();
    window.addEventListener("scroll", compute, { passive: true });
    window.addEventListener("resize", compute);
    return () => {
      window.removeEventListener("scroll", compute);
      window.removeEventListener("resize", compute);
    };
  }, [sections]);

  function go(e: React.MouseEvent, id: string) {
    e.preventDefault();
    const el = document.getElementById(id);
    if (!el) return;
    setActive(id);
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    // h-0 wrapper reserves no space in flow, so nothing shifts when the bar is
    // hidden; -mx-10 lets the blurred bar span the full main-content width.
    <div className="sticky top-0 z-30 -mx-10 h-0">
      <div
        className={`border-b border-slate-200 bg-white/80 px-10 backdrop-blur-sm transition-all duration-200 ${
          show ? "opacity-100" : "pointer-events-none -translate-y-1 opacity-0"
        }`}
      >
        <div className="flex h-12 items-center gap-4">
          <div className="flex min-w-0 items-center gap-1.5 text-sm">
            <Link
              href={orgHref}
              className="shrink-0 text-slate-500 hover:text-slate-700"
            >
              {orgName}
            </Link>
            <span className="text-slate-300">/</span>
            <span className="truncate font-medium text-gray-900">{siteName}</span>
            <span
              className={`ml-1 shrink-0 rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                STATUS_BADGE[status] ?? "bg-slate-100 text-slate-600"
              }`}
            >
              {status}
            </span>
          </div>
          <nav className="ml-auto flex items-center gap-1 overflow-x-auto">
            {sections.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                onClick={(e) => go(e, s.id)}
                className={`whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  active === s.id
                    ? "bg-indigo-50 text-indigo-700"
                    : "text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                }`}
              >
                {s.label}
              </a>
            ))}
          </nav>
        </div>
      </div>
    </div>
  );
}
