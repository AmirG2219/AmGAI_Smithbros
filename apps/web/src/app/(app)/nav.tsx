"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid, Users, Contact, FileText, Mail } from "lucide-react";

const items = [
  { href: "/", label: "Overview", Icon: LayoutGrid },
  { href: "/leads", label: "Leads", Icon: Users },
  { href: "/contacts", label: "Contacts", Icon: Contact },
  { href: "/campaigns", label: "Campaigns", Icon: Mail },
  { href: "/agreements", label: "Agreements", Icon: FileText },
];

function useActive() {
  const path = usePathname();
  return (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
}

// Sidebar links (tablet and desktop)
export function Nav() {
  const isActive = useActive();
  return (
    <nav className="flex flex-col gap-1">
      {items.map(({ href, label, Icon }) => (
        <Link
          key={href}
          href={href}
          className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${
            isActive(href)
              ? "bg-bronze/20 text-gold"
              : "text-cream/60 hover:bg-white/5 hover:text-cream"
          }`}
        >
          <Icon size={18} strokeWidth={1.6} />
          {label}
        </Link>
      ))}
    </nav>
  );
}

// Bottom tab bar (phones)
export function MobileNav() {
  const isActive = useActive();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 flex border-t border-white/10 bg-walnut pb-[env(safe-area-inset-bottom)] md:hidden">
      {items.map(({ href, label, Icon }) => (
        <Link
          key={href}
          href={href}
          className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] ${
            isActive(href) ? "text-gold" : "text-cream/60"
          }`}
        >
          <Icon size={20} strokeWidth={1.6} />
          {label}
        </Link>
      ))}
    </nav>
  );
}
