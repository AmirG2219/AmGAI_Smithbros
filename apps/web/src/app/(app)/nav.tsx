"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid, Users, Contact } from "lucide-react";

const items = [
  { href: "/", label: "Overview", Icon: LayoutGrid },
  { href: "/leads", label: "Leads", Icon: Users },
  { href: "/contacts", label: "Contacts", Icon: Contact },
];

export function Nav() {
  const path = usePathname();
  return (
    <nav className="flex flex-col gap-1">
      {items.map(({ href, label, Icon }) => {
        const active = href === "/" ? path === "/" : path.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${
              active
                ? "bg-bronze/20 text-gold"
                : "text-cream/60 hover:bg-white/5 hover:text-cream"
            }`}
          >
            <Icon size={18} strokeWidth={1.6} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
