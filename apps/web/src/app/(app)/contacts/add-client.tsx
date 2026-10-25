"use client";

import { useActionState, useRef } from "react";
import { useFormStatus } from "react-dom";
import { Plus, X } from "lucide-react";
import { MANUAL_SOURCES, SOURCE_LABELS } from "@/lib/contacts/sources";
import { createContact } from "./actions";

const input = "w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-bronze";
const label = "mb-1 block text-xs font-medium uppercase tracking-[0.15em] text-muted";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button disabled={pending} className="rounded-lg bg-walnut px-5 py-2.5 text-sm font-medium text-cream transition-colors hover:bg-bronze disabled:opacity-60">
      {pending ? "Adding…" : "Add client"}
    </button>
  );
}

// "Add client" opens a small window over the list. Problems show inside it; success goes back to the list.
export function AddClient() {
  const ref = useRef<HTMLDialogElement>(null);
  const [state, action] = useActionState(createContact, null);
  return (
    <>
      <button
        type="button"
        onClick={() => ref.current?.showModal()}
        className="inline-flex items-center gap-2 rounded-lg bg-walnut px-4 py-2.5 text-sm font-medium text-cream hover:bg-bronze"
      >
        <Plus size={16} /> Add client
      </button>
      <dialog
        ref={ref}
        onClick={(e) => e.target === ref.current && ref.current?.close()}
        className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-2xl border border-line bg-cream p-0 text-ink shadow-2xl backdrop:bg-black/50 backdrop:backdrop-blur-[2px]"
      >
        <form action={action} className="grid gap-4 p-6 sm:grid-cols-2">
          <div className="flex items-start justify-between gap-4 sm:col-span-2">
            <h2 className="font-serif text-2xl">Add a client</h2>
            <button type="button" onClick={() => ref.current?.close()} aria-label="Close" className="rounded-lg p-1.5 text-muted hover:bg-line/60 hover:text-walnut">
              <X size={18} />
            </button>
          </div>
          {state?.error && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 sm:col-span-2">{state.error}</p>
          )}
          <div>
            <label className={label} htmlFor="ac_first">First name *</label>
            <input id="ac_first" name="first_name" required className={input} />
          </div>
          <div>
            <label className={label} htmlFor="ac_last">Last name</label>
            <input id="ac_last" name="last_name" className={input} />
          </div>
          <div>
            <label className={label} htmlFor="ac_email">Email</label>
            <input id="ac_email" name="email" type="email" className={input} />
          </div>
          <div>
            <label className={label} htmlFor="ac_phone">Phone</label>
            <input id="ac_phone" name="phone" type="tel" className={input} />
          </div>
          <div className="sm:col-span-2">
            <label className={label} htmlFor="ac_source">How did they come to us?</label>
            <select id="ac_source" name="source" defaultValue="manual" className={input}>
              {MANUAL_SOURCES.map((v) => (
                <option key={v} value={v}>
                  {SOURCE_LABELS[v]}
                </option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-3 sm:col-span-2">
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
