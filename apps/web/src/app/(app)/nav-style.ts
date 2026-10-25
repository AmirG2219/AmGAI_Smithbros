// Shared look of the sidebar entries. Collapsing is driven by html[data-sidebar="collapsed"] (the `collapsed` variant),
// so the saved preference applies before the page paints and never mismatches the server render.
export const navLink =
  "group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-gold md:collapsed:justify-center md:collapsed:px-0";
export const navIdle = "text-sidebar-fg/65 hover:bg-white/[0.06] hover:text-sidebar-fg";
export const navActive = "bg-bronze/20 text-gold";
export const navLabel = "truncate md:collapsed:sr-only";
export const navTip =
  "pointer-events-none absolute left-full top-1/2 z-50 ml-3 hidden -translate-y-1/2 whitespace-nowrap rounded-md bg-sidebar px-2.5 py-1.5 text-xs font-medium text-sidebar-fg shadow-lg ring-1 ring-white/15 md:collapsed:group-hover:block md:collapsed:group-focus-visible:block";
