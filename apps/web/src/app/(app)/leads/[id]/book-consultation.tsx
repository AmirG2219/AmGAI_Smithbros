"use client";

import { useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { CalendarPlus, X } from "lucide-react";

const input = "w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-bronze";
const label = "mb-1 block text-xs font-medium uppercase tracking-[0.15em] text-muted";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      disabled={pending}
      className="rounded-lg bg-walnut px-5 py-2.5 text-sm font-medium text-cream transition-colors hover:bg-bronze disabled:opacity-60"
    >
      {pending ? "Booking…" : "Book consultation"}
    </button>
  );
}

// A button that opens a small booking window. Staff pick a time with the customer; the customer gets a confirmation email.
// When the company's calendar (Calendly) is connected, this button is the one place to switch over to it.
export function BookConsultation({ action, clientEmail }: { action: (formData: FormData) => void | Promise<void>; clientEmail: string | null }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [min, setMin] = useState("");

  function open() {
    // Earliest time offered is now (the browser's own clock, shown as local time).
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    setMin(d.toISOString().slice(0, 16));
    ref.current?.showModal();
  }

  return (
    <>
      <button
        type="button"
        onClick={open}
        className="inline-flex items-center gap-2 rounded-lg bg-walnut px-4 py-2.5 text-sm font-medium text-cream transition-colors hover:bg-bronze"
      >
        <CalendarPlus size={16} /> Book consultation
      </button>

      <dialog
        ref={ref}
        onClick={(e) => e.target === ref.current && ref.current?.close()}
        className="m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border border-line bg-cream p-0 text-ink shadow-2xl backdrop:bg-black/50 backdrop:backdrop-blur-[2px]"
      >
        <form action={action} className="grid gap-4 p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-serif text-2xl">Book a consultation</h2>
              <p className="mt-1 text-sm text-muted">
                The free visit to see the space and give an accurate quote. The customer gets a confirmation email.
              </p>
            </div>
            <button type="button" onClick={() => ref.current?.close()} aria-label="Close" className="rounded-lg p-1.5 text-muted hover:bg-line/60 hover:text-walnut">
              <X size={18} />
            </button>
          </div>

          <div>
            <label className={label} htmlFor="start">Date and time (Calgary)</label>
            <input id="start" name="start" type="datetime-local" required min={min} className={input} />
          </div>
          <div>
            <label className={label} htmlFor="minutes">Length</label>
            <select id="minutes" name="minutes" defaultValue="60" className={input}>
              <option value="30">30 minutes</option>
              <option value="60">1 hour</option>
              <option value="90">1.5 hours</option>
              <option value="120">2 hours</option>
            </select>
          </div>

          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="notify" defaultChecked={!!clientEmail} disabled={!clientEmail} className="mt-1" />
            <span>
              {clientEmail ? (
                <>
                  Email the client a confirmation with a calendar invite
                  <span className="block text-xs text-muted">Sent to {clientEmail}</span>
                </>
              ) : (
                <span className="text-muted">This lead has no email address, so no confirmation can be sent.</span>
              )}
            </span>
          </label>

          <div className="flex flex-wrap justify-end gap-3 pt-1">
            <button type="button" onClick={() => ref.current?.close()} className="rounded-lg border border-line px-5 py-2.5 text-sm hover:border-bronze">
              Cancel
            </button>
            <Submit />
          </div>
        </form>
      </dialog>
    </>
  );
}
