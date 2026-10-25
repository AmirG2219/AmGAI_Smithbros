"use client";

import { useState } from "react";
import { Send, X } from "lucide-react";

const input = "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-bronze";
const lbl = "mb-1 block text-xs font-medium uppercase tracking-[0.15em] text-subtle";
const KEY = "smith-inbox-compose";

type Saved = { to: string; subject: string; body: string };

const load = (): Saved => {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) return { to: "", subject: "", body: "", ...(JSON.parse(raw) as Partial<Saved>) };
  } catch {
    /* storage blocked: start empty */
  }
  return { to: "", subject: "", body: "" };
};

// A new message (not a reply). Replies are saved with their conversation; a brand-new message has no conversation yet,
// so its draft is kept in this browser only. Sending is switched off until the Gmail connection exists.
export function Compose({ connected, onClose }: { connected: boolean; onClose: () => void }) {
  const [v, setV] = useState<Saved>(load);
  const [note, setNote] = useState<string | null>(null);

  const save = () => {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(v));
      setNote("Draft saved on this device.");
    } catch {
      setNote("This browser wouldn't save the draft.");
    }
  };
  const discard = () => {
    try {
      window.localStorage.removeItem(KEY);
    } catch {
      /* nothing to clear */
    }
    onClose();
  };

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-line bg-card" aria-label="New message">
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <h2 className="font-serif text-xl">New message</h2>
        <button onClick={onClose} className="inline-flex items-center gap-1 rounded-lg border border-line px-3 py-1.5 text-sm text-subtle hover:border-bronze hover:text-walnut">
          <X size={15} /> Close
        </button>
      </div>
      <div className="grid min-h-0 flex-1 content-start gap-3 overflow-y-auto p-4">
        <div>
          <label className={lbl} htmlFor="cm-to">To</label>
          <input id="cm-to" type="email" value={v.to} onChange={(e) => setV({ ...v, to: e.target.value })} className={input} placeholder="name@example.com" />
        </div>
        <div>
          <label className={lbl} htmlFor="cm-subject">Subject</label>
          <input id="cm-subject" value={v.subject} onChange={(e) => setV({ ...v, subject: e.target.value })} className={input} />
        </div>
        <div>
          <label className={lbl} htmlFor="cm-body">Message</label>
          <textarea id="cm-body" rows={10} value={v.body} onChange={(e) => setV({ ...v, body: e.target.value })} className={`${input} leading-relaxed`} />
        </div>
      </div>
      <div className="border-t border-line bg-cream/50 px-4 py-3">
        {!connected && <p className="mb-2 text-xs text-bronze">Gmail isn&apos;t connected yet, so new messages can&apos;t be sent. You can write and save a draft.</p>}
        {note && <p className="mb-2 text-xs text-subtle" role="status">{note}</p>}
        <div className="flex flex-wrap items-center gap-2">
          <button
            disabled
            title={connected ? "Sending new messages is not available yet" : "Connect Gmail to send"}
            className="inline-flex items-center gap-2 rounded-lg bg-walnut px-4 py-2 text-sm font-medium text-cream disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Send size={15} /> Send
          </button>
          <button onClick={save} className="rounded-lg border border-line px-4 py-2 text-sm hover:border-bronze">Save draft</button>
          <button onClick={discard} className="px-2 py-2 text-sm text-subtle underline hover:text-walnut">Discard</button>
        </div>
      </div>
    </section>
  );
}
