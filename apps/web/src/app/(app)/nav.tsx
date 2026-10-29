"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookUser, FileStack, LayoutGrid, Mail, Users } from "lucide-react";
import type { NavCounts } from "@/lib/dashboard/overview";
import { HelpButton, type HelpConfig } from "./help";
import { navActive, navIdle, navLabel, navLink, navTip } from "./nav-style";

type Item = {
  href: string;
  label: string;
  Icon: typeof LayoutGrid;
  // Other paths that belong to this item, so it stays highlighted on its sub-pages
  also?: string[];
};

export const items: Item[] = [
  { href: "/", label: "Dashboard", Icon: LayoutGrid },
  { href: "/leads", label: "Leads", Icon: Users },
  { href: "/inbox", label: "Inbox", Icon: Mail },
  { href: "/agreements", label: "Agreements", Icon: FileStack, also: ["/documents", "/contracts"] },
  { href: "/contacts", label: "Contacts", Icon: BookUser },
];

function matches(path: string, i: Item) {
  return i.href === "/" ? path === "/" : [i.href, ...(i.also ?? [])].some((p) => path === p || path.startsWith(`${p}/`));
}

// The label for the current page, shown in the top bar.
export function usePageTitle() {
  const path = usePathname();
  return items.find((i) => matches(path, i))?.label ?? "Dashboard";
}

// Which count (if any) each entry shows. Amber means something is waiting for staff.
const badgeKey: Record<string, keyof NavCounts> = { "/leads": "leads", "/inbox": "inbox", "/agreements": "agreements" };
const badgeNote: Record<string, string> = { "/leads": "to review", "/inbox": "need a reply", "/agreements": "to action" };

export function Sidebar({ help, counts, onNavigate }: { help: HelpConfig | null; counts: NavCounts | null; onNavigate?: () => void }) {
  const path = usePathname();
  return (
    <div className="flex h-full flex-col px-3 py-4">
      <div className="mb-5 flex flex-col items-center gap-2 border-b border-white/10 pb-4 md:collapsed:mb-4">
        <Image src="/logo.png" alt="Smith Bros" width={96} height={64} priority className="h-auto w-[78px] md:collapsed:w-[44px]" />
        <p className="text-[9px] uppercase tracking-[0.3em] text-gold md:collapsed:sr-only">Command Centre</p>
      </div>
      <nav aria-label="Main" className="flex flex-col gap-1">
        {items.map((i) => {
          const active = matches(path, i);
          const n = (badgeKey[i.href] && counts?.[badgeKey[i.href]]) || 0;
          const note = n ? `${n} ${badgeNote[i.href]}` : "";
          return (
            <Link
              key={i.href}
              href={i.href}
              prefetch
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={`${navLink} ${active ? navActive : navIdle}`}
            >
              {active && <span aria-hidden className="absolute inset-y-2 left-0 w-[3px] rounded-r bg-gold" />}
              <i.Icon size={18} strokeWidth={1.6} className="shrink-0" />
              <span className={navLabel}>{i.label}</span>
              {n > 0 && (
                <>
                  <span className="sr-only">, {note}</span>
                  <span aria-hidden className="ml-auto min-w-5 rounded-full bg-amber-500 px-1.5 text-center text-[11px] font-semibold leading-5 text-sidebar md:collapsed:hidden">
                    {n > 99 ? "99+" : n}
                  </span>
                  <span aria-hidden className="absolute right-3 top-1.5 hidden h-2.5 w-2.5 rounded-full bg-amber-500 ring-2 ring-sidebar md:collapsed:block" />
                </>
              )}
              <span aria-hidden className={navTip}>{n ? `${i.label} · ${note}` : i.label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto border-t border-white/10 pt-3">{help && <HelpButton help={help} />}</div>
    </div>
  );
}
