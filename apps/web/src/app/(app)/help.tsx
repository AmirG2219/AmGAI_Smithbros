"use client";

import { useRef } from "react";
import { CalendarDays, LifeBuoy, Mail, X } from "lucide-react";

export type HelpConfig = { bookingUrl: string | null; email: string | null; name: string | null };

// A quiet "Help" entry that fits in with the other menu items. It opens a small window with the ways to reach support.
// Where it points is set per installation (SUPPORT_* settings), so it never carries anyone's branding in the code.
export function HelpButton({ help, variant }: { help: HelpConfig; variant: "sidebar" | "sheet" }) {
  const ref = useRef<HTMLDialogElement>(null);
  const open = () => ref.current?.showModal();

  return (
    <>
      {variant === "sidebar" ? (
        <button
          type="button"
          onClick={open}
          className="group relative flex w-full items-center gap-3 overflow-hidden rounded-xl px-3 py-2.5 text-sm text-cream/60 transition-all duration-200 ease-out hover:translate-x-0.5 hover:bg-white/[0.06] hover:text-cream"
        >
          <LifeBuoy size={18} strokeWidth={1.6} className="transition-all duration-200 ease-out group-hover:scale-110 group-hover:text-gold" />
          <span>Help</span>
        </button>
      ) : (
        <button type="button" onClick={open} className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm text-cream/70">
          <LifeBuoy size={18} strokeWidth={1.6} />
          Help
        </button>
      )}

      <dialog
        ref={ref}
        onClick={(e) => e.target === ref.current && ref.current?.close()}
        className="m-auto w-[calc(100%-2rem)] max-w-sm rounded-2xl border border-line bg-cream p-0 text-ink shadow-2xl backdrop:bg-walnut/50 backdrop:backdrop-blur-[2px]"
      >
        <div className="grid gap-4 p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-serif text-2xl">Need a hand?</h2>
              <p className="mt-1 text-sm text-muted">Questions, changes, or something not working? We are here to help.</p>
            </div>
            <button type="button" onClick={() => ref.current?.close()} aria-label="Close" className="rounded-lg p-1.5 text-muted hover:bg-line/60 hover:text-walnut">
              <X size={18} />
            </button>
          </div>

          {help.bookingUrl && (
            <a
              href={help.bookingUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-walnut px-4 py-3 text-sm font-medium text-cream transition-colors hover:bg-bronze"
            >
              <CalendarDays size={16} /> Book a call
            </a>
          )}
          {help.email && (
            <a
              href={`mailto:${help.email}`}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-line px-4 py-3 text-sm transition-colors hover:border-bronze"
            >
              <Mail size={16} /> {help.email}
            </a>
          )}
          {help.name && <p className="text-center text-xs text-muted">Support by {help.name}</p>}
        </div>
      </dialog>
    </>
  );
}
