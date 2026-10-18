"use client";

import { useRef } from "react";
import { Pencil, X } from "lucide-react";
import { SOURCE_LABELS } from "@/lib/contacts/sources";

const input = "w-full rounded-lg border border-line bg-white px-3 py-2.5 text-sm outline-none focus:border-bronze";
const label = "mb-1 block text-xs font-medium uppercase tracking-[0.15em] text-muted";

type C = { first_name: string; last_name: string | null; email: string | null; phone: string | null; source: string | null };

export function EditClient({ action, client }: { action: (formData: FormData) => void | Promise<void>; client: C }) {
  const ref = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button
        type="button"
        onClick={() => ref.current?.showModal()}
        className="inline-flex items-center gap-2 rounded-lg border border-line px-4 py-2.5 text-sm transition-colors hover:border-bronze"
      >
        <Pencil size={15} /> Edit
      </button>
      <dialog
        ref={ref}
        onClick={(e) => e.target === ref.current && ref.current?.close()}
        className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-2xl border border-line bg-cream p-0 text-ink shadow-2xl backdrop:bg-walnut/50 backdrop:backdrop-blur-[2px]"
      >
        <form action={action} className="grid gap-4 p-6 sm:grid-cols-2">
          <div className="flex items-start justify-between gap-4 sm:col-span-2">
            <h2 className="font-serif text-2xl">Edit client</h2>
            <button type="button" onClick={() => ref.current?.close()} aria-label="Close" className="rounded-lg p-1.5 text-muted hover:bg-line/60 hover:text-walnut">
              <X size={18} />
            </button>
          </div>
          <div>
            <label className={label} htmlFor="first_name">First name *</label>
            <input id="first_name" name="first_name" required defaultValue={client.first_name} className={input} />
          </div>
          <div>
            <label className={label} htmlFor="last_name">Last name</label>
            <input id="last_name" name="last_name" defaultValue={client.last_name ?? ""} className={input} />
          </div>
          <div>
            <label className={label} htmlFor="email">Email</label>
            <input id="email" name="email" type="email" defaultValue={client.email ?? ""} className={input} />
          </div>
          <div>
            <label className={label} htmlFor="phone">Phone</label>
            <input id="phone" name="phone" type="tel" defaultValue={client.phone ?? ""} className={input} />
          </div>
          <div className="sm:col-span-2">
            <label className={label} htmlFor="source">Came from</label>
            <select id="source" name="source" defaultValue={client.source ?? "other"} className={input}>
              {Object.entries(SOURCE_LABELS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-3 sm:col-span-2">
            <button type="button" onClick={() => ref.current?.close()} className="rounded-lg border border-line px-5 py-2.5 text-sm hover:border-bronze">
              Cancel
            </button>
            <button className="rounded-lg bg-walnut px-5 py-2.5 text-sm font-medium text-cream hover:bg-bronze">Save</button>
          </div>
        </form>
      </dialog>
    </>
  );
}
