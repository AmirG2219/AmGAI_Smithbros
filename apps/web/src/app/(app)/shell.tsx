"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { LogOut, Menu, Moon, PanelLeftClose, PanelLeftOpen, Sun, X } from "lucide-react";
import type { HelpConfig } from "./help";
import { Sidebar, usePageTitle } from "./nav";

type Theme = "light" | "dark";
const root = () => document.documentElement;

// Preferences live in localStorage and are mirrored onto <html> as data attributes. The inline script in the layout
// applies them before first paint; this module keeps them in sync afterwards.
function store(attr: "data-theme" | "data-sidebar", key: string, fallback: string) {
  const listeners = new Set<() => void>();
  return {
    subscribe(fn: () => void) {
      listeners.add(fn);
      return () => void listeners.delete(fn);
    },
    get: () => root().getAttribute(attr) ?? fallback,
    set(v: string) {
      root().setAttribute(attr, v);
      try {
        localStorage.setItem(key, v);
      } catch {}
      listeners.forEach((fn) => fn());
    },
  };
}
const themeStore = store("data-theme", "sb-theme", "light");
const sidebarStore = store("data-sidebar", "sb-sidebar", "expanded");

export const preferenceScript = `try{var d=document.documentElement,t=localStorage.getItem("sb-theme");if(!t)t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";d.setAttribute("data-theme",t);if(localStorage.getItem("sb-sidebar")==="collapsed")d.setAttribute("data-sidebar","collapsed")}catch(e){}`;

const iconBtn =
  "inline-flex h-9 w-9 items-center justify-center rounded-lg text-ink/70 outline-none transition-colors hover:bg-line/60 hover:text-ink focus-visible:ring-2 focus-visible:ring-bronze";

type User = { name: string; role: string };

export function AppShell({
  user,
  help,
  signOut,
  children,
}: {
  user: User;
  help: HelpConfig | null;
  signOut: () => Promise<void>;
  children: React.ReactNode;
}) {
  const theme = useSyncExternalStore(themeStore.subscribe, themeStore.get, () => "light") as Theme;
  const collapsed = useSyncExternalStore(sidebarStore.subscribe, sidebarStore.get, () => "expanded") === "collapsed";
  const [drawer, setDrawer] = useState(false);
  const title = usePageTitle();

  // The inline script only runs on a full page load; this covers arriving here by in-app navigation, and clears the
  // theme again on leaving (e.g. signing out) so the public pages stay light.
  useEffect(() => {
    const d = root();
    try {
      if (!d.hasAttribute("data-theme")) {
        d.setAttribute("data-theme", localStorage.getItem("sb-theme") === "dark" ? "dark" : "light");
      }
      if (localStorage.getItem("sb-sidebar") === "collapsed") d.setAttribute("data-sidebar", "collapsed");
    } catch {}
    return () => {
      d.removeAttribute("data-theme");
      d.removeAttribute("data-sidebar");
    };
  }, []);

  useEffect(() => {
    if (!drawer) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setDrawer(false);
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [drawer]);

  return (
    <div className="flex min-h-dvh">
      <aside
        className="sticky top-0 hidden h-dvh shrink-0 border-r border-white/10 bg-sidebar text-sidebar-fg transition-[width] duration-200 md:block w-[248px] md:collapsed:w-[70px]"
      >
        <Sidebar help={help} />
      </aside>

      {drawer && (
        <div className="fixed inset-0 z-40 md:hidden">
          <button aria-label="Close menu" onClick={() => setDrawer(false)} className="absolute inset-0 bg-black/50" />
          <aside
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
            className="absolute inset-y-0 left-0 w-[260px] max-w-[85vw] bg-sidebar text-sidebar-fg shadow-2xl"
          >
            <button
              aria-label="Close menu"
              onClick={() => setDrawer(false)}
              className="absolute right-2 top-2 z-10 rounded-lg p-2 text-sidebar-fg/60 hover:text-sidebar-fg"
            >
              <X size={18} />
            </button>
            <Sidebar help={help} onNavigate={() => setDrawer(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-line bg-cream/90 px-3 backdrop-blur sm:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <button aria-label="Open menu" onClick={() => setDrawer(true)} className={`${iconBtn} md:hidden`}>
              <Menu size={18} />
            </button>
            <button
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              onClick={() => sidebarStore.set(collapsed ? "expanded" : "collapsed")}
              className={`${iconBtn} max-md:hidden`}
            >
              {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
            </button>
            <p className="truncate text-sm font-medium tracking-wide text-ink/80">{title}</p>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              onClick={() => themeStore.set(theme === "dark" ? "light" : "dark")}
              className={iconBtn}
            >
              {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <AccountMenu user={user} signOut={signOut} />
          </div>
        </header>
        <main className="min-w-0 flex-1 p-4 sm:p-6 md:p-8 lg:p-10">{children}</main>
      </div>
    </div>
  );
}

function AccountMenu({ user, signOut }: { user: User; signOut: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        aria-label="Account menu"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((o) => !o)}
        className="flex h-9 w-9 items-center justify-center rounded-full bg-bronze text-sm font-medium text-white outline-none focus-visible:ring-2 focus-visible:ring-gold"
      >
        {user.name.slice(0, 1).toUpperCase()}
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-11 z-40 w-56 rounded-xl border border-line bg-card p-1.5 shadow-xl">
          <div className="px-3 py-2">
            <p className="truncate text-sm">{user.name}</p>
            <p className="text-[10px] uppercase tracking-widest text-muted">{user.role}</p>
          </div>
          <form action={signOut} className="border-t border-line pt-1.5">
            <button role="menuitem" className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-line/60">
              <LogOut size={15} /> Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
