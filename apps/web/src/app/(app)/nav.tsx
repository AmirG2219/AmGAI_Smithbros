"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Contact, FileSignature, FileText, Inbox, LayoutGrid, Mail, MoreHorizontal, Users } from "lucide-react";

const items = [
  { href: "/", label: "Overview", Icon: LayoutGrid },
  { href: "/inbox", label: "Inbox", Icon: Inbox },
  { href: "/leads", label: "Leads", Icon: Users },
  { href: "/campaigns", label: "Campaigns", Icon: Mail },
  { href: "/contacts", label: "Contacts", Icon: Contact },
  { href: "/contracts", label: "Contracts", Icon: FileSignature },
  { href: "/agreements", label: "Agreements", Icon: FileText },
];
const PRIMARY = 4; // shown in the phone tab bar; the rest go under "More"

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

// Bottom tab bar (phones): four main tabs plus a "More" sheet for the rest
export function MobileNav() {
  const isActive = useActive();
  const [open, setOpen] = useState(false);
  const more = items.slice(PRIMARY);
  const moreActive = more.some((i) => isActive(i.href));

  return (
    <>
      {open && (
        <div className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-20 border-t border-white/10 bg-walnut p-2 md:hidden">
          {more.map(({ href, label, Icon }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm ${
                isActive(href) ? "text-gold" : "text-cream/70"
              }`}
            >
              <Icon size={18} strokeWidth={1.6} />
              {label}
            </Link>
          ))}
        </div>
      )}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-white/10 bg-walnut pb-[env(safe-area-inset-bottom)] md:hidden">
        {items.slice(0, PRIMARY).map(({ href, label, Icon }) => (
          <Link
            key={href}
            href={href}
            onClick={() => setOpen(false)}
            className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-[10px] ${
              isActive(href) ? "text-gold" : "text-cream/60"
            }`}
          >
            <Icon size={20} strokeWidth={1.6} />
            {label}
          </Link>
        ))}
        <button
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-[10px] ${
            open || moreActive ? "text-gold" : "text-cream/60"
          }`}
        >
          <MoreHorizontal size={20} strokeWidth={1.6} />
          More
        </button>
      </nav>
    </>
  );
}
