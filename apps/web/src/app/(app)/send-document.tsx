"use client";

import { useRef } from "react";
import { useFormStatus } from "react-dom";
import { Send, X } from "lucide-react";

const input = "w-full rounded-lg border border-line bg-white px-3 py-2.5 text-sm outline-none focus:border-bronze";
const label = "mb-1 block text-xs font-medium uppercase tracking-[0.15em] text-muted";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button disabled={pending} className="rounded-lg bg-walnut px-5 py-2.5 text-sm font-medium text-cream transition-colors hover:bg-bronze disabled:opacity-60">
      {pending ? "Sending…" : "Send with PDF attached"}
    </button>
  );
}

// A button that opens a small window to review and send a generated document to the client.
export function SendDocument({
  action,
  defaultTo,
  subject,
  message,
  resend,
}: {
  action: (formData: FormData) => void | Promise<void>;
  defaultTo: string;
  subject: string;
  message: string;
  resend: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button
        type="button"
        onClick={() => ref.current?.showModal()}
        className="inline-flex items-center gap-2 rounded-lg bg-walnut px-4 py-2 text-sm font-medium text-cream transition-colors hover:bg-bronze"
      >
        <Send size={14} /> {resend ? "Send again" : "Send to client"}
      </button>
      <dialog
        ref={ref}
        onClick={(e) => e.target === ref.current && ref.current?.close()}
        className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-2xl border border-line bg-cream p-0 text-ink shadow-2xl backdrop:bg-walnut/50 backdrop:backdrop-blur-[2px]"
      >
        <form action={action} className="grid gap-4 p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-serif text-2xl">Send to client</h2>
              <p className="mt-1 text-sm text-muted">The PDF is attached and the email is saved to the client&apos;s timeline.</p>
            </div>
            <button type="button" onClick={() => ref.current?.close()} aria-label="Close" className="rounded-lg p-1.5 text-muted hover:bg-line/60 hover:text-walnut">
              <X size={18} />
            </button>
          </div>
          <div>
            <label className={label} htmlFor="to">To</label>
            <input id="to" name="to" type="email" required defaultValue={defaultTo} className={input} />
          </div>
          <div>
            <label className={label} htmlFor="subject">Subject</label>
            <input id="subject" name="subject" required defaultValue={subject} className={input} />
          </div>
          <div>
            <label className={label} htmlFor="body">Message</label>
            <textarea id="body" name="body" required rows={7} defaultValue={message} className={input} />
          </div>
          <div className="flex flex-wrap justify-end gap-3">
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
