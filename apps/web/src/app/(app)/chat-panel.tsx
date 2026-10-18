"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { RotateCcw, Send, Sparkles, X } from "lucide-react";

type Turn = { role: "user" | "assistant"; content: string };

const STORE = "sb-assistant-chat";
const SUGGESTIONS = [
  "What needs my attention today?",
  "Which leads haven't booked a consultation?",
  "Summarize the latest emails",
  "Draft a reply to the newest email that needs one",
];

// ---- a tiny, safe formatter: **bold**, "- " lists and links to our own pages only. Never raw HTML. ----
function inline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*\*([^*]+)\*\*|\[([^\]]+)\]\((\/[^)\s]*)\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const key = `${keyBase}-${i++}`;
    if (m[1]) out.push(<strong key={key}>{m[1]}</strong>);
    else if (m[3].startsWith("//")) out.push(m[0]);
    else
      out.push(
        <Link key={key} href={m[3]} className="text-bronze underline hover:text-walnut">
          {m[2]}
        </Link>,
      );
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function Rich({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/);
  return (
    <>
      {blocks.map((block, bi) => {
        const lines = block.split("\n");
        if (lines.every((l) => /^\s*[-*]\s+/.test(l)))
          return (
            <ul key={bi} className="my-1 list-disc space-y-0.5 pl-5">
              {lines.map((l, li) => (
                <li key={li}>{inline(l.replace(/^\s*[-*]\s+/, ""), `${bi}-${li}`)}</li>
              ))}
            </ul>
          );
        return (
          <p key={bi} className="my-1 whitespace-pre-wrap">
            {inline(block, `${bi}`)}
          </p>
        );
      })}
    </>
  );
}

export function ChatPanel({ enabled }: { enabled: boolean }) {
  const [open, setOpen] = useState(false);
  // Remembered for this browser tab only. On the server there is no storage, so it starts empty there.
  const [turns, setTurns] = useState<Turn[]>(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(STORE) ?? "[]");
      return Array.isArray(saved) ? saved : [];
    } catch {
      return [];
    }
  });
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    try {
      sessionStorage.setItem(STORE, JSON.stringify(turns.slice(-40)));
    } catch {
      /* ignore */
    }
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns, busy, open]);
  useEffect(() => {
    if (open) inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  async function send(text: string) {
    const msg = text.trim();
    if (!msg || busy) return;
    setError("");
    const next: Turn[] = [...turns, { role: "user", content: msg }];
    setTurns(next);
    setInput("");
    setBusy(true);
    try {
      const res = await fetch("/api/assistant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next.slice(-20) }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Something went wrong.");
      setTurns([...next, { role: "assistant", content: String(json.reply ?? "") }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Open the assistant chat"
        className={`fixed bottom-20 right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-walnut text-gold shadow-lg ring-1 ring-gold/30 transition-all duration-200 hover:scale-105 hover:bg-bronze hover:text-cream md:bottom-6 md:right-6 ${open ? "pointer-events-none scale-90 opacity-0" : ""}`}
      >
        <Sparkles size={22} strokeWidth={1.6} />
      </button>

      {open && (
        // A floating window in the corner (no dimmed backdrop), so the page stays visible and usable behind it.
        <section
          role="dialog"
          aria-label="Assistant chat"
          className="chat-window fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] right-3 z-50 flex h-[min(560px,calc(100dvh-8rem))] w-[calc(100vw-1.5rem)] flex-col overflow-hidden rounded-2xl border border-line bg-cream shadow-2xl ring-1 ring-black/5 sm:bottom-6 sm:right-6 sm:h-[min(520px,calc(100dvh-7rem))] sm:w-[400px]"
        >
            <header className="flex items-center gap-3 border-b border-line bg-card px-5 py-4">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-walnut text-gold">
                <Sparkles size={17} strokeWidth={1.6} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-serif text-xl leading-none">Ask the assistant</p>
                <p className="mt-1 text-xs text-muted">Answers and drafts. It never sends anything.</p>
              </div>
              {turns.length > 0 && (
                <button onClick={() => { setTurns([]); setError(""); }} aria-label="Start a new chat" title="New chat" className="rounded-lg p-2 text-muted hover:bg-line/60 hover:text-walnut">
                  <RotateCcw size={16} />
                </button>
              )}
              <button onClick={() => setOpen(false)} aria-label="Close" className="rounded-lg p-2 text-muted hover:bg-line/60 hover:text-walnut">
                <X size={18} />
              </button>
            </header>

            <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4" aria-live="polite">
              {!enabled ? (
                <div className="rounded-xl border border-line bg-card p-4 text-sm text-muted">
                  The chat turns on when an OpenAI API key is added to the app. Until then, everything else in the Email Assistant works.
                </div>
              ) : turns.length === 0 ? (
                <div>
                  <p className="mb-3 text-sm text-muted">Ask about your emails and leads, or have it write a reply. For example:</p>
                  <div className="flex flex-col gap-2">
                    {SUGGESTIONS.map((s) => (
                      <button key={s} onClick={() => send(s)} className="rounded-xl border border-line bg-card px-4 py-3 text-left text-sm transition-colors hover:border-bronze hover:bg-white">
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                turns.map((t, i) => (
                  <div key={i} className={t.role === "user" ? "flex justify-end" : "flex justify-start"}>
                    <div className={`max-w-[88%] rounded-2xl px-4 py-2.5 text-sm ${t.role === "user" ? "bg-walnut text-cream" : "border border-line bg-card"}`}>
                      {t.role === "user" ? <p className="whitespace-pre-wrap">{t.content}</p> : <Rich text={t.content} />}
                    </div>
                  </div>
                ))
              )}
              {busy && (
                <div className="flex justify-start">
                  <div className="flex gap-1 rounded-2xl border border-line bg-card px-4 py-3" aria-label="The assistant is thinking">
                    {[0, 1, 2].map((d) => (
                      <span key={d} className="h-1.5 w-1.5 animate-bounce rounded-full bg-bronze" style={{ animationDelay: `${d * 120}ms` }} />
                    ))}
                  </div>
                </div>
              )}
              {error && <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
              <div ref={endRef} />
            </div>

            {enabled && (
              <form
                onSubmit={(e) => { e.preventDefault(); void send(input); }}
                className="flex items-end gap-2 border-t border-line bg-card px-4 py-3"
              >
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(input); } }}
                  rows={1}
                  placeholder="Ask about your emails or leads"
                  className="max-h-32 min-h-[44px] flex-1 resize-none rounded-xl border border-line bg-white px-3 py-2.5 text-sm outline-none focus:border-bronze"
                />
                <button disabled={busy || !input.trim()} aria-label="Send" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-walnut text-cream transition-colors hover:bg-bronze disabled:opacity-40">
                  <Send size={17} />
                </button>
              </form>
            )}
        </section>
      )}
    </>
  );
}
