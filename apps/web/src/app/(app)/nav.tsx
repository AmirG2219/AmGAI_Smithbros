"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { BookUser, FileStack, LayoutGrid, Mail, MoreHorizontal, Send, Users } from "lucide-react";

type Item = {
  href: string;
  label: string;
  Icon: typeof LayoutGrid;
  // Other paths that belong to this item, so it stays highlighted on its sub-pages
  also?: string[];
};

// What the team does each day, in the order they do it.
const main: Item[] = [
  { href: "/", label: "Overview", Icon: LayoutGrid },
  { href: "/leads", label: "Leads", Icon: Users },
  { href: "/inbox", label: "Email Assistant", Icon: Mail },
  { href: "/documents", label: "Documents", Icon: FileStack, also: ["/contracts", "/agreements"] },
  { href: "/campaigns", label: "Marketing Emails", Icon: Send },
];
// Reference data: used often, but not the daily flow, so it sits at the bottom.
const bottom: Item[] = [{ href: "/contacts", label: "Contacts", Icon: BookUser }];

const PHONE_TABS = 4; // Overview, Leads, Email Assistant, Documents; the rest go under "More"

function useActive() {
  const path = usePathname();
  return (i: Item) =>
    i.href === "/"
      ? path === "/"
      : [i.href, ...(i.also ?? [])].some((p) => path === p || path.startsWith(`${p}/`));
}

// Sidebar links (tablet and desktop). The "bottom" list is drawn at the foot of the sidebar.
export function Nav({ position }: { position: "main" | "bottom" }) {
  const isActive = useActive();
  return (
    <nav className="flex flex-col gap-1">
      {(position === "main" ? main : bottom).map((i) => (
        <Link
          key={i.href}
          href={i.href}
          className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${
            isActive(i) ? "bg-bronze/20 text-gold" : "text-cream/60 hover:bg-white/5 hover:text-cream"
          }`}
        >
          <i.Icon size={18} strokeWidth={1.6} />
          {i.label}
        </Link>
      ))}
    </nav>
  );
}

// Bottom tab bar (phones): four main tabs plus a "More" sheet for the rest
export function MobileNav() {
  const isActive = useActive();
  const [open, setOpen] = useState(false);
  const all = [...main, ...bottom];
  const more = all.slice(PHONE_TABS);
  const moreActive = more.some(isActive);

  return (
    <>
      {open && (
        <div className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-20 border-t border-white/10 bg-walnut p-2 md:hidden">
          {more.map((i) => (
            <Link
              key={i.href}
              href={i.href}
              onClick={() => setOpen(false)}
              className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm ${
                isActive(i) ? "text-gold" : "text-cream/70"
              }`}
            >
              <i.Icon size={18} strokeWidth={1.6} />
              {i.label}
            </Link>
          ))}
        </div>
      )}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-white/10 bg-walnut pb-[env(safe-area-inset-bottom)] md:hidden">
        {all.slice(0, PHONE_TABS).map((i) => (
          <Link
            key={i.href}
            href={i.href}
            onClick={() => setOpen(false)}
            className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-[10px] ${
              isActive(i) ? "text-gold" : "text-cream/60"
            }`}
          >
            <i.Icon size={20} strokeWidth={1.6} />
            {i.label === "Email Assistant" ? "Email" : i.label}
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
