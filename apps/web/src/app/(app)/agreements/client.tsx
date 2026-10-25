"use client";

import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { Check, FileUp, Link2, MoreHorizontal, Send, X } from "lucide-react";
import { secureLinkAction } from "./actions";

export const input = "w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-bronze";
export const labelCls = "mb-1 block text-xs font-medium uppercase tracking-[0.15em] text-muted";

export function Submit({ children, pending: text, className }: { children: React.ReactNode; pending?: string; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      disabled={pending}
      className={className ?? "rounded-lg bg-walnut px-5 py-2.5 text-sm font-medium text-cream transition-colors hover:bg-bronze disabled:opacity-60"}
    >
      {pending ? (text ?? "Working…") : children}
    </button>
  );
}

// Opens a window to review and send (or remind). Disabled, with the reasons shown, until sending is allowed.
export function SendDialog({
  action,
  title,
  button,
  defaultTo,
  subject,
  message,
  blockers,
  alsoOption,
  sendKey,
  needsConfirm = false,
  primary = true,
  compact = false,
}: {
  action: (formData: FormData) => void | Promise<void>;
  title: string;
  button: string;
  defaultTo: string;
  subject: string;
  message: string;
  blockers: string[];
  alsoOption?: { id: string; label: string };
  sendKey?: string; // identifies this opening of the form: repeating the same request cannot send twice
  needsConfirm?: boolean; // an earlier attempt has no recorded outcome: staff must confirm it was not sent
  primary?: boolean;
  compact?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const disabled = blockers.length > 0;
  const btn = primary
    ? "bg-walnut text-cream hover:bg-bronze"
    : "border border-line bg-surface text-walnut hover:border-bronze";
  return (
    <>
      <button
        type="button"
        disabled={disabled}
        title={disabled ? blockers.join(" ") : undefined}
        onClick={() => ref.current?.showModal()}
        className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${compact ? "" : "w-full"} ${btn}`}
      >
        <Send size={14} /> {button}
      </button>
      <dialog
        ref={ref}
        onClick={(e) => e.target === ref.current && ref.current?.close()}
        className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-2xl border border-line bg-cream p-0 text-ink shadow-2xl backdrop:bg-black/50 backdrop:backdrop-blur-[2px]"
      >
        <form action={action} className="grid gap-4 p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-serif text-2xl">{title}</h2>
              <p className="mt-1 text-sm text-muted">The PDF is attached and the email is saved to the customer&apos;s timeline.</p>
            </div>
            <button type="button" onClick={() => ref.current?.close()} aria-label="Close" className="rounded-lg p-1.5 text-muted hover:bg-line/60 hover:text-walnut">
              <X size={18} />
            </button>
          </div>
          {sendKey && <input type="hidden" name="send_key" value={sendKey} />}
          {needsConfirm && (
            <label className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
              <input type="checkbox" name="confirm_resend" required className="mt-0.5" />
              <span><strong>An earlier send has no recorded result.</strong> Before sending again, check the email provider&apos;s own records (its sending log or dashboard) for this recipient and time. I have checked them and found no sent email. This is recorded as my statement, not as confirmation from the provider.</span>
            </label>
          )}
          <div>
            <label className={labelCls} htmlFor="to">To</label>
            <input id="to" name="to" type="email" required defaultValue={defaultTo} className={input} />
          </div>
          <div>
            <label className={labelCls} htmlFor="subject">Subject</label>
            <input id="subject" name="subject" required defaultValue={subject} className={input} />
          </div>
          {alsoOption && (
            <label className="flex items-start gap-2 rounded-lg bg-surface px-3 py-2.5 text-sm">
              <input type="checkbox" name="also" value={alsoOption.id} defaultChecked className="mt-0.5" />
              <span>{alsoOption.label}</span>
            </label>
          )}
          <div>
            <label className={labelCls} htmlFor="body">Message</label>
            <textarea id="body" name="body" required rows={7} defaultValue={message} className={input} />
          </div>
          <div className="flex flex-wrap justify-end gap-3">
            <button type="button" onClick={() => ref.current?.close()} className="rounded-lg border border-line px-5 py-2.5 text-sm hover:border-bronze">
              Cancel
            </button>
            <Submit pending="Sending…">{button}</Submit>
          </div>
        </form>
      </dialog>
    </>
  );
}

export function CopyLink({ documentId, menu = false }: { documentId: string; menu?: boolean }) {
  const [state, setState] = useState<"idle" | "busy" | "copied" | "error">("idle");
  const [url, setUrl] = useState<string | null>(null);
  async function copy() {
    setState("busy");
    const r = await secureLinkAction(documentId);
    if (!r.url) return setState("error");
    setUrl(r.url);
    try {
      await navigator.clipboard.writeText(r.url);
      setState("copied");
    } catch {
      setState("idle"); // clipboard blocked: the link is shown below to copy by hand
    }
  }
  return (
    <div>
      <button
        type="button"
        onClick={copy}
        disabled={state === "busy"}
        className={menu ? "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-cream disabled:opacity-60" : "inline-flex w-full items-center justify-center gap-2 rounded-lg border border-line bg-surface px-4 py-2.5 text-sm hover:border-bronze disabled:opacity-60"}
      >
        {state === "copied" ? <Check size={14} /> : <Link2 size={14} />}
        {state === "copied" ? "Link copied" : state === "error" ? "Could not create link" : "Copy secure link"}
      </button>
      {url && (
        <input readOnly value={url} onFocus={(e) => e.currentTarget.select()} className="mt-2 w-full rounded-lg border border-line bg-surface px-2 py-1.5 text-xs text-muted" aria-label="Secure link" />
      )}
      {!menu && <p className="mt-1 text-xs text-muted">Expires in 7 days.</p>}
    </div>
  );
}

// A button that asks first. Used for actions that retire or cancel a document.
export function ConfirmButton({ children, message, className }: { children: React.ReactNode; message: string; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      disabled={pending}
      onClick={(e) => {
        if (!confirm(message)) e.preventDefault();
      }}
      className={className ?? "w-full rounded-lg border border-line bg-surface px-4 py-2.5 text-sm hover:border-bronze disabled:opacity-60"}
    >
      {children}
    </button>
  );
}

// "More" menu for secondary actions. Closes on outside click or Escape.
export function MoreMenu({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) ref.current?.removeAttribute("open");
    };
    document.addEventListener("click", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("click", close);
      document.removeEventListener("keydown", close);
    };
  }, []);
  return (
    <details ref={ref} className="relative">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded-lg border border-line bg-surface px-3.5 py-2.5 text-sm hover:border-bronze [&::-webkit-details-marker]:hidden">
        <MoreHorizontal size={16} /> More
      </summary>
      <div className="absolute right-0 z-20 mt-1.5 grid w-56 gap-0.5 rounded-xl border border-line bg-card p-1.5 shadow-lg">{children}</div>
    </details>
  );
}

export const menuItem = "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-cream";

// Opens a small window to upload the customer's signed PDF. Posts to the upload route; uploading never verifies.
export function UploadDialog({ action, primary, label }: { action: string; primary: boolean; label: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button
        type="button"
        onClick={() => ref.current?.showModal()}
        className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${primary ? "bg-walnut text-cream hover:bg-bronze" : "border border-line bg-surface text-walnut hover:border-bronze"}`}
      >
        <FileUp size={14} /> {label}
      </button>
      <dialog
        ref={ref}
        onClick={(e) => e.target === ref.current && ref.current?.close()}
        className="m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border border-line bg-cream p-0 text-ink shadow-2xl backdrop:bg-black/50 backdrop:backdrop-blur-[2px]"
      >
        <form action={action} method="post" encType="multipart/form-data" className="grid gap-4 p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-serif text-2xl">Upload signed copy</h2>
              <p className="mt-1 text-sm text-muted">Kept as evidence. Uploading does not verify it: review and verify it afterwards.</p>
            </div>
            <button type="button" onClick={() => ref.current?.close()} aria-label="Close" className="rounded-lg p-1.5 text-muted hover:bg-line/60 hover:text-walnut">
              <X size={18} />
            </button>
          </div>
          <div>
            <label className={labelCls} htmlFor="file">Signed PDF (max 15 MB)</label>
            <input id="file" name="file" type="file" accept="application/pdf" required className="w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-surface file:px-3 file:py-2 file:text-sm" />
          </div>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => ref.current?.close()} className="rounded-lg border border-line px-5 py-2.5 text-sm hover:border-bronze">Cancel</button>
            <button className="rounded-lg bg-walnut px-5 py-2.5 text-sm font-medium text-cream hover:bg-bronze">Upload</button>
          </div>
        </form>
      </dialog>
    </>
  );
}
