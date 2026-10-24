"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, CalendarClock, Check, ChevronDown, Download, Mail, Paperclip, RefreshCw, Search, Send, Sparkles, X } from "lucide-react";
import { Card } from "../ui";
import { Pager } from "../pager";
import { discardDraft, ensureDraft, followUp, getPanel, mailPulse, markRead, saveDraft, sendDraft, setEmailStatus, writeDraft } from "./actions";
import { categoryOf, priorityOf } from "./style";
import { OPEN_DRAFT, type AttachT, type DraftT, type EmailT, type MsgT, type PanelData, type WaitingT } from "./types";

// The inbox lives in the browser: the list, every email's details and its draft are loaded once, so opening an email,
// switching between emails and closing one are instant. Only saving, sending and rewriting talk to the server.

const input = "w-full rounded-lg border border-line bg-white px-3 py-2.5 text-sm outline-none focus:border-bronze";
const lbl = "mb-1 block text-xs font-medium uppercase tracking-[0.15em] text-muted";
const btn = "inline-flex items-center justify-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium transition-colors disabled:opacity-60";

const NOTICES: Record<string, string> = {
  drafted: "A new draft is ready. Read it and edit anything before you send.",
  saved: "Draft saved.",
  sent: "Reply sent. It is saved in this conversation and on the lead's timeline.",
  queued: "Approved. It will go out as soon as the Gmail connection is set up.",
  rejected: "Draft discarded.",
  demo: "Not sent: demo mode only allows emails to approved test addresses.",
  "send-failed": "The reply could not be sent. Your draft is kept. Try again.",
  "draft-failed": "The assistant couldn't write a draft just now.",
  invalid: "That didn't work. Please try again.",
};

const TZ = "America/Edmonton";
const short = (iso: string) => new Date(iso).toLocaleString("en-CA", { timeZone: TZ, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const long = (iso: string) => new Date(iso).toLocaleString("en-CA", { timeZone: TZ, dateStyle: "medium", timeStyle: "short" });
const initials = (name: string) =>
  name
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("") || "?";

export type TabT = { key: string; label: string; count: number; href: string };

type Props = {
  rows: EmailT[];
  waiting: WaitingT[];
  tab: string; // reply, waiting, done, or search
  query: string;
  unread: number;
  tabs: TabT[];
  page: number;
  total: number;
  listHref: string; // this tab and page, with no email open
  pageLinks: string[]; // the address of each page of this tab, in order
  initialSelected: string | null;
  ai: boolean;
  connected: boolean;
  loadError: boolean;
};

const kb = (n: number) => (n >= 1_048_576 ? `${(n / 1_048_576).toFixed(1)} MB` : n >= 1024 ? `${Math.round(n / 1024)} KB` : `${n} B`);
const RISKY = /\.(exe|scr|bat|cmd|com|msi|jar|js|vbs|ps1|lnk|iso)$/i;

// The files that came with an email. Each downloads; none is ever opened in the browser.
function Attachments({ files }: { files: AttachT[] }) {
  if (files.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {files.map((f) => {
        const risky = RISKY.test(f.filename);
        const body = (
          <>
            <Paperclip size={14} className="shrink-0" />
            <span className="max-w-[16rem] truncate">{f.filename}</span>
            <span className="text-xs text-muted">{kb(f.size_bytes)}</span>
            {risky && <span className="rounded bg-[#F8E1DB] px-1.5 text-xs text-[#A23A25]">Be careful</span>}
            {f.stored !== false && <Download size={14} className="shrink-0 text-bronze" />}
          </>
        );
        return f.stored === false ? (
          <span key={f.id} title="This file was too large to save" className="inline-flex items-center gap-2 rounded-lg border border-dashed border-line px-3 py-2 text-sm text-muted">
            {body}
          </span>
        ) : (
          <a key={f.id} href={`/api/inbox/attachments/${f.id}`} className="inline-flex items-center gap-2 rounded-lg border border-line bg-white px-3 py-2 text-sm transition-colors hover:border-bronze">
            {body}
          </a>
        );
      })}
    </div>
  );
}

// A formatted email, shown in a sealed frame: no scripts run, no pictures or fonts load from the internet (so senders
// cannot see that you opened it), and links open in a new tab.
function HtmlBody({ html }: { html: string }) {
  const doc =
    '<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; img-src data:; font-src data:">' +
    '<base target="_blank"><style>body{font:14px/1.55 Arial,Helvetica,sans-serif;color:#211a16;margin:14px;overflow-wrap:anywhere}img{max-width:100%;height:auto}table{max-width:100%}a{color:#8a5f2b}</style>' +
    html;
  return (
    <iframe
      title="Email"
      sandbox="allow-popups allow-popups-to-escape-sandbox"
      srcDoc={doc}
      referrerPolicy="no-referrer"
      className="h-[26rem] w-full rounded-lg border border-line bg-white"
    />
  );
}

function Skeleton() {
  return (
    <div className="animate-pulse space-y-4" aria-busy="true" aria-label="Loading email">
      <div className="h-36 rounded-2xl border border-line bg-card" />
      <div className="h-24 rounded-2xl border border-line bg-card" />
      <div className="h-48 rounded-2xl border border-line bg-card" />
    </div>
  );
}

function MessageCard({ m }: { m: MsgT }) {
  const mine = m.direction === "outbound";
  return (
    <div className={`rounded-xl border p-4 ${mine ? "border-bronze/30 bg-cream/70" : "border-line bg-white"}`}>
      <p className="mb-2 text-xs text-muted" suppressHydrationWarning>
        {mine ? "You replied" : m.from_name || m.from_address} · {long(m.received_at)}
      </p>
      {/* Plain text only: email content is untrusted and never rendered as HTML */}
      <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed">{m.body_text || "(empty)"}</pre>
    </div>
  );
}

// The reply box. It keeps what is being typed; a rewritten draft arrives as a new draft and replaces it.
function Composer({
  draft,
  connected,
  ai,
  busy,
  onSend,
  onSave,
  onRewrite,
  onDiscard,
}: {
  draft: DraftT;
  connected: boolean;
  ai: boolean;
  busy: boolean;
  onSend: (subject: string, body: string) => void;
  onSave: (subject: string, body: string) => void;
  onRewrite: (instruction: string) => void;
  onDiscard: () => void;
}) {
  const [subject, setSubject] = useState(draft.subject);
  const [body, setBody] = useState(draft.body_text);
  const [instruction, setInstruction] = useState("");
  return (
    <div className="grid gap-4">
      {!ai && draft.source === "manual" && (
        <p className="rounded-xl border border-line bg-cream/60 px-4 py-3 text-sm text-muted">
          AI drafting is off, so this is just a starting point. Once the OpenAI key is connected, a full reply is written for you here.
        </p>
      )}
      {draft.checks.length > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="mb-2 flex items-center gap-2 font-medium">
            <AlertTriangle size={16} /> Check before you send
          </p>
          <ul className="list-disc space-y-1 pl-5">
            {draft.checks.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </div>
      )}
      {draft.status === "failed" && draft.error_summary && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{draft.error_summary}</p>
      )}
      {draft.status === "approved" && (
        <p className="rounded-xl border border-line bg-cream/60 px-4 py-3 text-sm">Approved and waiting for the Gmail connection. You can still edit it below.</p>
      )}

      <div className="grid gap-3">
        <div>
          <label className={lbl} htmlFor="subject">Subject</label>
          <input id="subject" value={subject} onChange={(e) => setSubject(e.target.value)} className={input} />
        </div>
        <div>
          <label className={lbl} htmlFor="body">Message</label>
          <textarea id="body" rows={11} value={body} onChange={(e) => setBody(e.target.value)} className={`${input} leading-relaxed`} />
          <p className="mt-1 text-xs text-muted">Your signature is added automatically.</p>
        </div>
        {!connected && <p className="text-xs text-bronze">Gmail sending isn&apos;t connected yet, so sending keeps the reply ready without sending it.</p>}
        <div className="flex flex-wrap gap-3">
          <button disabled={busy} onClick={() => onSend(subject, body)} className={`${btn} bg-walnut text-cream hover:bg-bronze`}>
            <Send size={15} /> {busy ? "Working…" : draft.status === "approved" || draft.status === "failed" ? "Send now" : "Send reply"}
          </button>
          <button disabled={busy} onClick={() => onSave(subject, body)} className={`${btn} border border-line hover:border-bronze`}>
            Save draft
          </button>
        </div>
      </div>

      <div className="grid gap-3 border-t border-line pt-4">
        {ai && (
          <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
            <div>
              <label className={lbl} htmlFor="instruction">Ask for a different version</label>
              <input
                id="instruction"
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                placeholder="e.g. Shorter, and offer Thursday at 2pm"
                className={input}
              />
            </div>
            <button disabled={busy} onClick={() => onRewrite(instruction)} className={`${btn} border border-bronze text-bronze hover:bg-bronze hover:text-cream`}>
              <Sparkles size={15} /> Rewrite
            </button>
          </div>
        )}
        <button disabled={busy} onClick={onDiscard} className="w-fit text-sm text-muted underline hover:text-walnut">
          Discard this draft
        </button>
      </div>
    </div>
  );
}

export function InboxView(props: Props) {
  const { rows, waiting, tab, query, tabs, page, total, listHref, pageLinks, ai, connected, loadError } = props;
  const router = useRouter();
  const [pending, start] = useTransition();

  const [selected, setSelected] = useState<string | null>(props.initialSelected);
  // What this session knows about each email, kept even after a refresh drops it from the list.
  const [known, setKnown] = useState<Map<string, EmailT>>(() => new Map(rows.map((r) => [r.id, r])));
  const [prevRows, setPrevRows] = useState(rows);
  if (prevRows !== rows) {
    setPrevRows(rows);
    setKnown((m) => new Map([...m, ...rows.map((r) => [r.id, r] as const)]));
  }
  const [fetched, setFetched] = useState<Record<string, PanelData>>({});
  const [draftsOf, setDraftsOf] = useState<Record<string, DraftT[]>>({});
  const [statusOf, setStatusOf] = useState<Record<string, string>>({});
  const [autoState, setAutoState] = useState<Record<string, "done" | "failed">>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [readOf, setReadOf] = useState<Record<string, true>>({});
  const [newMail, setNewMail] = useState(false);
  const [showPlain, setShowPlain] = useState(false);
  const started = useRef(new Set<string>());
  const baseline = useRef<{ latest: string | null } | null>(null);

  // ---- opening and closing: instant, the address bar follows ----
  const urlFor = (id: string | null) => (id ? `${listHref}${listHref.includes("?") ? "&" : "?"}e=${id}` : listHref);
  const open = (id: string) => {
    setSelected(id);
    setNotice(null);
    setShowPlain(false);
    setReadOf((m) => ({ ...m, [id]: true }));
    void markRead(id);
    window.history.pushState(null, "", urlFor(id));
  };
  const close = () => {
    setSelected(null);
    window.history.pushState(null, "", urlFor(null));
  };
  useEffect(() => {
    const onPop = () => setSelected(new URL(window.location.href).searchParams.get("e"));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // Every 20 seconds (while this tab is on screen) check whether new mail has arrived.
  // With nothing open, the list refreshes by itself; otherwise a small notice offers the refresh, so nothing jumps under you.
  const idle = !selected;
  useEffect(() => {
    const check = async () => {
      if (document.hidden) return;
      try {
        const p = await mailPulse();
        if (!baseline.current) {
          baseline.current = { latest: p.latest };
          return;
        }
        if (p.latest !== baseline.current.latest) {
          baseline.current = { latest: p.latest };
          if (idle && !query) router.refresh();
          else setNewMail(true);
        }
      } catch {
        /* offline or signed out: try again next time */
      }
    };
    void check();
    const t = setInterval(check, 20_000);
    return () => clearInterval(t);
  }, [idle, query, router]);

  // An email opened from a link or the address bar counts as read too.
  useEffect(() => {
    if (props.initialSelected) void markRead(props.initialSelected);
  }, [props.initialSelected]);

  // In the background, fetch the conversation (and the email itself, if it is not on this page).
  useEffect(() => {
    if (!selected || started.current.has(`p:${selected}`)) return;
    started.current.add(`p:${selected}`);
    getPanel(selected).then((d) => d && setFetched((m) => ({ ...m, [selected]: d })));
  }, [selected]);

  const fromServer = selected ? fetched[selected] : undefined;
  const base = selected ? (known.get(selected) ?? (fromServer ? { ...fromServer.email, email_drafts: fromServer.drafts } : null)) : null;
  const email = base && selected ? { ...base, status: statusOf[selected] ?? base.status } : null;
  const drafts = selected ? (draftsOf[selected] ?? base?.email_drafts ?? []) : [];
  const thread = fromServer?.thread ?? [];
  const openDraft = drafts.find((d) => OPEN_DRAFT.includes(d.status));
  const sentDraft = drafts.find((d) => d.status === "sent");
  const canAutoDraft =
    !!email && email.direction === "inbound" && email.status === "open" && email.needs_reply !== false && !openDraft && !sentDraft && !autoState[email.id];

  // A reply is drafted as soon as an email that needs one is opened.
  useEffect(() => {
    if (!selected || !canAutoDraft || started.current.has(`d:${selected}`)) return;
    started.current.add(`d:${selected}`);
    ensureDraft(selected).then((r) => {
      if (r.ok && r.draft) setDraftsOf((m) => ({ ...m, [selected]: [r.draft!, ...(m[selected] ?? []).filter((d) => d.id !== r.draft!.id)] }));
      setAutoState((m) => ({ ...m, [selected]: r.ok ? "done" : "failed" }));
    });
  }, [selected, canAutoDraft]);

  const putDraft = (id: string, d: DraftT | null | undefined) =>
    d && setDraftsOf((m) => ({ ...m, [id]: [d, ...(m[id] ?? known.get(id)?.email_drafts ?? fetched[id]?.drafts ?? []).filter((x) => x.id !== d.id)] }));

  // ---- actions: the screen updates first, the server catches up ----
  const run = (fn: () => Promise<void>) => start(async () => void (await fn()));
  const doSend = (subject: string, body: string) =>
    run(async () => {
      if (!email || !openDraft) return;
      const r = await sendDraft(openDraft.id, subject, body);
      putDraft(email.id, r.draft);
      setNotice(r.notice ?? null);
      if (r.ok && r.notice === "sent") setStatusOf((m) => ({ ...m, [email.id]: "handled" }));
      router.refresh();
    });
  const doSave = (subject: string, body: string) =>
    run(async () => {
      if (!openDraft) return;
      const r = await saveDraft(openDraft.id, subject, body);
      setNotice(r.notice ?? null);
    });
  const doRewrite = (instruction: string) =>
    run(async () => {
      if (!email) return;
      const r = await writeDraft(email.id, instruction);
      putDraft(email.id, r.draft);
      setNotice(r.notice ?? null);
    });
  const doBlank = () =>
    run(async () => {
      if (!email) return;
      const r = await writeDraft(email.id, "", true);
      putDraft(email.id, r.draft);
      setAutoState((m) => ({ ...m, [email.id]: "done" }));
    });
  const doDiscard = () =>
    run(async () => {
      if (!email || !openDraft) return;
      await discardDraft(openDraft.id);
      setDraftsOf((m) => ({ ...m, [email.id]: drafts.filter((d) => d.id !== openDraft.id) }));
      setAutoState((m) => ({ ...m, [email.id]: "done" }));
      setNotice("rejected");
    });
  const doStatus = (status: "open" | "handled" | "archived") =>
    run(async () => {
      if (!email) return;
      setStatusOf((m) => ({ ...m, [email.id]: status }));
      if (status !== "open") close();
      await setEmailStatus(email.id, status);
      router.refresh();
    });
  const doFollowUp = (w: WaitingT) =>
    run(async () => {
      open(w.emailId);
      const r = await followUp(w.emailId, w.daysWaiting);
      putDraft(w.emailId, r.draft);
      setNotice(r.notice ?? null);
    });

  const shown = rows.filter((r) => (statusOf[r.id] ?? r.status) === r.status || tab !== "reply");
  const c = email?.contacts ?? null;
  const sender = email ? email.from_name || email.from_address : "";
  const messages: MsgT[] = thread.length ? thread : email ? [email as unknown as MsgT] : [];
  const earlier = messages.slice(0, -1);
  const latest = messages[messages.length - 1];

  return (
    <div>
      {/* On a phone, an open email takes the whole screen; on a computer the list and the email sit side by side. */}
      <div className={`mb-3 flex-wrap items-center gap-3 ${selected ? "hidden lg:flex" : "flex"}`}>
        <form action="/inbox" className="relative min-w-0 flex-1 sm:max-w-sm">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            name="q"
            defaultValue={query}
            placeholder="Search all mail"
            aria-label="Search all mail"
            className="w-full rounded-full border border-line bg-white py-2 pl-9 pr-9 text-sm outline-none focus:border-bronze"
          />
          {query && (
            <Link href="/inbox" aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted hover:text-walnut">
              <X size={14} />
            </Link>
          )}
        </form>
        {props.unread > 0 && <span className="text-xs text-muted">{props.unread} unread</span>}
        {newMail && (
          <button
            onClick={() => {
              setNewMail(false);
              router.refresh();
            }}
            className="inline-flex items-center gap-2 rounded-full bg-gold/20 px-4 py-1.5 text-sm text-walnut transition-colors hover:bg-gold/30"
          >
            <RefreshCw size={14} /> New mail arrived. Show it
          </button>
        )}
      </div>
      {query && (
        <p className={`mb-3 text-sm text-muted ${selected ? "hidden lg:block" : ""}`}>
          {total} result{total === 1 ? "" : "s"} for &ldquo;{query}&rdquo; in all mail
        </p>
      )}
      <div className={`mb-4 flex-wrap gap-2 ${selected ? "hidden lg:flex" : "flex"}`}>
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={t.href}
            className={`inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm ${
              tab === t.key ? "border-walnut bg-walnut text-cream" : "border-line bg-card text-muted hover:text-walnut"
            }`}
          >
            {t.label}
            {t.count > 0 && <span className={`rounded-full px-1.5 text-xs ${tab === t.key ? "bg-cream/20" : "bg-line"}`}>{t.count}</span>}
          </Link>
        ))}
      </div>
      {loadError && <p className="mb-4 text-red-700">Could not load the inbox.</p>}

      <div className={selected ? "lg:grid lg:grid-cols-[minmax(300px,380px)_minmax(0,1fr)] lg:items-start lg:gap-6" : ""}>
        <section className={`min-w-0 ${selected ? "hidden lg:block" : ""}`} aria-label="Emails">
          {tab === "waiting" ? (
            waiting.length === 0 ? (
              <Card className="px-6 py-10 text-center text-sm text-muted">
                No one is overdue. Everyone you replied to has answered, or it hasn&apos;t been 3 days yet.
              </Card>
            ) : (
              <div className="grid gap-2">
                {waiting.map((w) => (
                  <Card key={w.emailId} className={`p-4 transition-colors hover:border-bronze ${selected === w.emailId ? "border-bronze bg-cream/60" : ""}`}>
                    <button onClick={() => open(w.emailId)} className="block w-full text-left">
                      <p className="truncate font-medium">{w.name}</p>
                      <p className="truncate text-sm">{w.subject || "(no subject)"}</p>
                      <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted">
                        <CalendarClock size={13} /> You replied {w.daysWaiting} days ago. No answer yet.
                      </p>
                    </button>
                    <button onClick={() => doFollowUp(w)} className="mt-2 rounded-lg bg-walnut px-3 py-1.5 text-xs font-medium text-cream hover:bg-bronze">
                      Draft a follow-up
                    </button>
                  </Card>
                ))}
              </div>
            )
          ) : shown.length === 0 ? (
            <Card className="px-6 py-10 text-center text-sm text-muted">{tab === "reply" ? "Nothing needs a reply right now." : "Nothing here yet."}</Card>
          ) : (
            <div className="grid gap-2">
              {shown.map((e) => {
                const ds = draftsOf[e.id] ?? e.email_drafts;
                const draftReady = ds?.some((d) => OPEN_DRAFT.includes(d.status));
                const unread = !e.read_at && !readOf[e.id];
                const pr = priorityOf(e.priority);
                const cat = categoryOf(e.category);
                return (
                  <button key={e.id} onClick={() => open(e.id)} className="block w-full text-left">
                    <Card
                      className={`relative overflow-hidden p-4 pl-5 transition-colors before:absolute before:inset-y-0 before:left-0 before:w-1 hover:border-bronze ${pr.edge} ${
                        selected === e.id ? "border-bronze bg-cream/60" : ""
                      } ${unread ? "bg-white" : ""} ${
                        selected ? "" : "lg:grid lg:grid-cols-[220px_minmax(0,1fr)_auto] lg:items-center lg:gap-x-6 lg:px-5 lg:py-3.5"
                      }`}
                    >
                      <div className={`flex items-center justify-between gap-2 ${selected ? "" : "lg:block"}`}>
                        <p className={`flex min-w-0 items-center gap-2 truncate ${unread ? "font-semibold" : "font-medium"}`}>
                          {unread && <span aria-label="Unread" className="h-2 w-2 shrink-0 rounded-full bg-bronze" />}
                          <span className="truncate">{e.from_name || e.from_address}</span>
                        </p>
                        <span className={`shrink-0 text-xs text-muted ${selected ? "" : "lg:hidden"}`} suppressHydrationWarning>{short(e.received_at)}</span>
                      </div>
                      <div className="min-w-0">
                        <p className={`mt-0.5 truncate text-sm lg:mt-0 ${unread ? "font-semibold" : ""}`}>{e.subject || "(no subject)"}</p>
                        <p className="mt-1 line-clamp-2 text-xs text-muted lg:line-clamp-1">{e.summary ?? e.body_text.replace(/\s+/g, " ").slice(0, 160)}</p>
                      </div>
                      <span className={`hidden shrink-0 text-xs text-muted ${selected ? "" : "lg:block"}`} suppressHydrationWarning>{short(e.received_at)}</span>
                      <div className={`mt-2 flex flex-wrap items-center gap-1.5 ${selected ? "" : "lg:col-start-1 lg:row-start-2 lg:mt-1"}`}>
                        {(e.priority === "urgent" || e.priority === "high") && (
                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${pr.chip}`}>{pr.label}</span>
                        )}
                        {cat && <span className={`rounded-full px-2 py-0.5 text-xs ${cat.chip}`}>{cat.label}</span>}
                        {e.inbox_attachments?.length > 0 && (
                          <span className="inline-flex items-center gap-1 text-xs text-muted">
                            <Paperclip size={12} /> {e.inbox_attachments.length}
                          </span>
                        )}
                        {e.analysis_status === "pending" && <span className="text-xs text-muted">Analyzing…</span>}
                        {draftReady && <span className="rounded-full bg-gold/15 px-2 py-0.5 text-xs text-bronze">Draft ready</span>}
                      </div>
                    </Card>
                  </button>
                );
              })}
            </div>
          )}
          <Pager page={page} total={total} hrefFor={(p) => pageLinks[p - 1] ?? listHref} />
        </section>

        <section
          className={`min-w-0 ${selected ? "" : "hidden"} lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto lg:pr-1`}
          aria-label="Selected email"
        >
          {!selected ? null : !email ? (
            <Skeleton />
          ) : (
            <div key={email.id} className="panel-in grid gap-4">
              <Card className="p-5 sm:p-6">
                <div className="flex items-start gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-walnut font-serif text-lg text-gold">{initials(sender)}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{sender}</p>
                    <p className="truncate text-xs text-muted" suppressHydrationWarning>
                      {email.from_name ? `${email.from_address} · ` : ""}
                      {long(email.received_at)}
                    </p>
                  </div>
                  <button
                    onClick={close}
                    aria-label="Close"
                    className="inline-flex items-center gap-1 rounded-lg border border-line px-3 py-1.5 text-sm text-muted transition-colors hover:border-bronze hover:text-walnut"
                  >
                    <X size={15} /> <span className="lg:hidden">Back</span>
                    <span className="hidden lg:inline">Close</span>
                  </button>
                </div>

                <h2 className="mt-4 font-serif text-2xl leading-tight">{email.subject || "(no subject)"}</h2>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {email.priority && email.priority !== "normal" && email.priority !== "low" && (
                    <span className={`rounded-full px-3 py-1 text-xs font-medium ${priorityOf(email.priority).chip}`}>{priorityOf(email.priority).label}</span>
                  )}
                  {categoryOf(email.category) && <span className={`rounded-full px-3 py-1 text-xs ${categoryOf(email.category)!.chip}`}>{categoryOf(email.category)!.label}</span>}
                  {email.needs_reply === false && <span className="rounded-full bg-line px-3 py-1 text-xs">No reply needed</span>}
                  {c && (
                    <Link href={`/contacts/${c.id}`} className="rounded-full border border-bronze/40 px-3 py-1 text-xs text-bronze hover:bg-bronze hover:text-cream">
                      Client: {c.first_name} {c.last_name}
                    </Link>
                  )}
                  {email.project_id && (
                    <Link href={`/leads/${email.project_id}`} className="rounded-full border border-bronze/40 px-3 py-1 text-xs text-bronze hover:bg-bronze hover:text-cream">
                      Open lead
                    </Link>
                  )}
                </div>
              </Card>

              {notice && NOTICES[notice] && <p className="rounded-xl border border-gold/40 bg-gold/10 px-4 py-3 text-sm">{NOTICES[notice]}</p>}

              <Card className="border-gold/40 bg-gold/[0.07] p-5">
                <p className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.15em] text-bronze">
                  <Sparkles size={14} /> At a glance
                </p>
                {email.summary ? (
                  <>
                    <p className="text-sm leading-relaxed">{email.summary}</p>
                    {email.suggested_action && (
                      <p className="mt-2 text-sm">
                        <span className="text-muted">Suggested next step: </span>
                        {email.suggested_action}
                      </p>
                    )}
                    <p className="mt-2 text-xs text-muted">AI summary. Please check it against the email.</p>
                  </>
                ) : (
                  <p className="text-sm text-muted">
                    {email.analysis_status === "skipped"
                      ? "Summaries are off until an OpenAI API key is added."
                      : email.analysis_status === "failed"
                        ? "A summary couldn't be generated for this email."
                        : "Summary is being prepared…"}
                  </p>
                )}
              </Card>

              <Card className="p-5">
                <p className="eyebrow mb-3">Conversation</p>
                <div className="grid gap-3">
                  {earlier.length > 0 && (
                    <details className="group rounded-xl border border-line">
                      <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-2.5 text-sm text-muted">
                        {earlier.length} earlier message{earlier.length === 1 ? "" : "s"}
                        <ChevronDown size={16} className="transition-transform group-open:rotate-180" />
                      </summary>
                      <div className="grid gap-3 border-t border-line p-3">
                        {earlier.map((m) => (
                          <MessageCard key={m.id} m={m} />
                        ))}
                      </div>
                    </details>
                  )}
                  {latest && email.body_html && !showPlain && latest.id === email.id ? (
                    <div className="grid gap-2">
                      <HtmlBody html={email.body_html} />
                      <p className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
                        <span>Pictures are hidden to protect your privacy.</span>
                        <button onClick={() => setShowPlain(true)} className="underline hover:text-walnut">
                          Show as plain text
                        </button>
                      </p>
                    </div>
                  ) : (
                    latest && (
                      <>
                        <MessageCard m={latest} />
                        {email.body_html && latest.id === email.id && (
                          <button onClick={() => setShowPlain(false)} className="w-fit text-xs text-muted underline hover:text-walnut">
                            Show formatted
                          </button>
                        )}
                      </>
                    )
                  )}
                  <Attachments files={(fromServer?.email.inbox_attachments ?? email.inbox_attachments ?? []) as AttachT[]} />
                </div>
              </Card>

              {email.direction === "inbound" && (
                <Card className="border-bronze/40 p-5">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <p className="eyebrow">Your reply</p>
                    {openDraft && (
                      <span className="inline-flex items-center gap-1.5 text-xs text-bronze">
                        {openDraft.source === "ai" && <Sparkles size={13} />}
                        {openDraft.source === "ai" ? "Drafted for you. Check it and edit anything." : "Draft"}
                      </span>
                    )}
                  </div>

                  {openDraft ? (
                    <Composer
                      key={`${openDraft.id}:${openDraft.body_text.length}:${openDraft.subject}`}
                      draft={openDraft}
                      connected={connected}
                      ai={ai}
                      busy={pending}
                      onSend={doSend}
                      onSave={doSave}
                      onRewrite={doRewrite}
                      onDiscard={doDiscard}
                    />
                  ) : canAutoDraft ? (
                    <div className="animate-pulse" role="status" aria-label="Writing a draft reply">
                      <p className="mb-3 flex items-center gap-2 text-sm text-bronze">
                        <Sparkles size={15} /> Writing a draft reply…
                      </p>
                      <div className="mb-3 h-10 rounded-lg bg-line/70" />
                      <div className="h-44 rounded-lg bg-line/50" />
                    </div>
                  ) : autoState[email.id] === "failed" ? (
                    <div className="grid gap-3">
                      <p className="text-sm text-muted">The assistant couldn&apos;t write a draft just now. You can write the reply yourself.</p>
                      <div className="flex flex-wrap gap-3">
                        <button disabled={pending} onClick={() => doRewrite("")} className={`${btn} border border-bronze text-bronze hover:bg-bronze hover:text-cream`}>
                          Try again
                        </button>
                        <button disabled={pending} onClick={doBlank} className={`${btn} bg-walnut text-cream hover:bg-bronze`}>
                          Write it myself
                        </button>
                      </div>
                    </div>
                  ) : sentDraft ? (
                    <div className="grid gap-3">
                      <p className="flex items-center gap-2 text-sm" suppressHydrationWarning>
                        <Check size={16} className="text-bronze" /> Reply sent {sentDraft.sent_at ? long(sentDraft.sent_at) : ""}. It is in the conversation above.
                      </p>
                      <button disabled={pending} onClick={() => doRewrite("")} className={`${btn} w-fit border border-line hover:border-bronze`}>
                        Write another reply
                      </button>
                    </div>
                  ) : (
                    <div className="grid gap-3">
                      <p className="text-sm text-muted">
                        {email.needs_reply === false ? "This email doesn't look like it needs a reply." : "This email is closed."} You can still write one.
                      </p>
                      <button disabled={pending} onClick={() => doRewrite("")} className={`${btn} w-fit border border-line hover:border-bronze`}>
                        Write a reply anyway
                      </button>
                    </div>
                  )}
                </Card>
              )}

              <div className="flex flex-wrap gap-3">
                {email.status === "open" ? (
                  <>
                    <button disabled={pending} onClick={() => doStatus("handled")} className={`${btn} border border-line hover:border-bronze`}>
                      <Check size={15} /> Mark handled
                    </button>
                    <button disabled={pending} onClick={() => doStatus("archived")} className={`${btn} border border-line hover:border-bronze`}>
                      Archive
                    </button>
                  </>
                ) : (
                  <button disabled={pending} onClick={() => doStatus("open")} className={`${btn} border border-line hover:border-bronze`}>
                    Reopen
                  </button>
                )}
              </div>
            </div>
          )}
        </section>
      </div>

      {!selected && (
        <div className="mt-6 hidden items-center justify-center gap-2 text-sm text-muted lg:flex">
          <Mail size={15} className="text-bronze" /> Pick an email. It opens beside the list with a reply already drafted for you.
        </div>
      )}
    </div>
  );
}
