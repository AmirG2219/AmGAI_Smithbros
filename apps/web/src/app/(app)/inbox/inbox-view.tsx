"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CalendarClock,
  Check,
  ChevronDown,
  Download,
  Eye,
  Inbox as InboxIcon,
  Paperclip,
  PenLine,
  Plus,
  RefreshCw,
  Search,
  Send,
  Sparkles,
  UserPlus,
  X,
} from "lucide-react";
import { Pager } from "../pager";
import { Compose } from "./compose";
import {
  createContactFromEmail,
  discardDraft,
  followUp,
  getLinks,
  getPanel,
  mailPulse,
  markRead,
  saveDraft,
  sendDraft,
  setEmailStatus,
  writeDraft,
} from "./actions";
import { categoryOf, priorityOf } from "./style";
import { OPEN_DRAFT, type AttachT, type DraftT, type EmailT, type LinkInfo, type MsgT, type PanelData, type WaitingT } from "./types";

// The inbox lives in the browser: the list, every email's details and its draft are loaded once, so opening an email,
// switching between emails and closing one are instant. Only saving, sending and rewriting talk to the server.

const input = "w-full rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none focus:border-bronze";
const btn = "inline-flex items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50";
const ghost = `${btn} border border-line bg-white hover:border-bronze disabled:hover:border-line`;

const NOTICES: Record<string, string> = {
  drafted: "A suggested reply is ready. Read it and edit anything before you send.",
  saved: "Draft saved.",
  sent: "Reply sent. It is saved in this conversation and on the lead's timeline.",
  queued: "Approved. It will go out as soon as the Gmail connection is set up.",
  rejected: "Draft discarded.",
  "not-connected": "Not sent: Gmail isn't connected yet. Your draft is kept.",
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
  tab: string; // all, reply, waiting, done, sent, or search
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
const PREVIEWABLE = /\.(png|jpe?g|gif|webp|pdf)$/i;

// The files that came with an email. Each says what can be done with it: preview and download, download only, or neither.
function Attachments({ files }: { files: AttachT[] }) {
  if (files.length === 0) return null;
  const act = "inline-flex items-center gap-1 rounded-md border border-line bg-cream/60 px-2 py-0.5 text-xs font-medium text-bronze hover:border-bronze";
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-1.5">
      {files.map((f) => {
        const risky = RISKY.test(f.filename);
        const stored = f.stored !== false;
        const previewable = stored && !risky && PREVIEWABLE.test(f.filename);
        return (
          <div key={f.id} className={`flex flex-wrap items-center gap-x-2.5 gap-y-1 rounded-lg border px-3 py-1.5 text-sm ${stored ? "border-line bg-white" : "border-dashed border-[#c9b9a3] bg-cream/40"}`}>
            <Paperclip size={13} className="shrink-0" />
            <span className="min-w-0 max-w-full flex-1 truncate" title={f.filename}>{f.filename}</span>
            <span className="text-xs text-[#6b5d4f]">{kb(f.size_bytes)}</span>
            {risky && <span className="rounded bg-[#F8E1DB] px-1.5 text-xs text-[#A23A25]">Be careful</span>}
            {stored ? (
              <span className="flex items-center gap-1.5">
                {previewable && (
                  <a href={`/api/inbox/attachments/${f.id}?view=1`} target="_blank" rel="noopener noreferrer" aria-label={`Preview ${f.filename}`} className={act}>
                    <Eye size={12} /> Preview
                  </a>
                )}
                <a href={`/api/inbox/attachments/${f.id}`} aria-label={`Download ${f.filename}`} className={act}>
                  <Download size={12} /> Download
                </a>
                {!previewable && <span className="text-xs text-[#6b5d4f]">No preview</span>}
              </span>
            ) : (
              <span className="text-xs text-[#6b5d4f]">Over the size limit, so it wasn&apos;t saved. Not available to preview or download. Ask the sender to resend it smaller.</span>
            )}
          </div>
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
    '<base target="_blank"><style>body{font:14px/1.55 Arial,Helvetica,sans-serif;color:#211a16;margin:12px;overflow-wrap:anywhere}img{max-width:100%;height:auto}table{max-width:100%}a{color:#8a5f2b}</style>' +
    html;
  return (
    <iframe
      title="Email"
      sandbox="allow-popups allow-popups-to-escape-sandbox"
      srcDoc={doc}
      referrerPolicy="no-referrer"
      className="h-[22rem] w-full rounded-lg border border-line bg-white"
    />
  );
}

function Skeleton() {
  return (
    <div className="animate-pulse space-y-3 p-4" aria-busy="true" aria-label="Loading email">
      <div className="h-16 rounded-xl bg-line/60" />
      <div className="h-40 rounded-xl bg-line/40" />
    </div>
  );
}

function MessageCard({ m, defaultOpen }: { m: MsgT; defaultOpen: boolean }) {
  const mine = m.direction === "outbound";
  return (
    <details open={defaultOpen} className={`group rounded-xl border ${mine ? "border-bronze/30 bg-cream/70" : "border-line bg-white"}`}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3.5 py-2 text-xs text-[#6b5d4f]">
        <span className="min-w-0 truncate" suppressHydrationWarning>
          <span className="font-medium text-ink">{mine ? "You" : m.from_name || m.from_address}</span> · {long(m.received_at)}
        </span>
        <ChevronDown size={14} className="shrink-0 transition-transform group-open:rotate-180" />
      </summary>
      {/* Plain text only: email content is untrusted and never rendered as HTML */}
      <pre className="whitespace-pre-wrap break-words border-t border-line/70 px-3.5 py-3 font-sans text-sm leading-relaxed">{m.body_text || "(empty)"}</pre>
    </details>
  );
}

// Who this email is from, in our own records. Nothing is ever created from an incoming email by itself.
function LinkCard({
  email,
  info,
  onCreate,
}: {
  email: EmailT;
  info: LinkInfo | undefined;
  onCreate: (first: string, last: string) => Promise<string | null>;
}) {
  const [adding, setAdding] = useState(false);
  const [first, setFirst] = useState(() => (email.from_name ?? "").split(/\s+/)[0] ?? "");
  const [last, setLast] = useState(() => (email.from_name ?? "").split(/\s+/).slice(1).join(" "));
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (email.direction !== "inbound") return null;

  const c = info?.contact ?? email.contacts;
  const p = info?.project ?? null;
  if (c) {
    const name = `${c.first_name} ${c.last_name ?? ""}`.trim();
    const where = [p?.site_address_line1, p?.site_city].filter(Boolean).join(", ");
    const contact = [info?.contact?.phone, info?.contact?.email].filter(Boolean).join(" · ");
    const projectLine = p ? [p.project_type?.replaceAll("_", " "), where, p.stage?.replaceAll("_", " ")].filter(Boolean).join(" · ") : "Linked project";
    const lab = "text-[11px] font-medium uppercase tracking-[0.15em] text-[#6b5d4f]";
    return (
      <div className="grid gap-x-6 gap-y-2 rounded-xl border border-bronze/30 bg-cream/60 px-4 py-3 text-sm sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto] sm:items-center">
        <div className="min-w-0">
          <p className={lab}>Customer</p>
          <Link href={`/contacts/${c.id}`} className="block truncate font-medium text-bronze hover:underline">{name}</Link>
          {contact && <p className="truncate text-xs text-[#6b5d4f]">{contact}</p>}
        </div>
        {(p || email.project_id) && (
          <>
            <div className="min-w-0">
              <p className={lab}>Project</p>
              <p className="truncate capitalize">{projectLine}</p>
            </div>
            <Link href={`/leads/${p?.id ?? email.project_id}`} className="justify-self-start rounded-lg bg-walnut px-3.5 py-1.5 text-sm font-medium text-cream hover:bg-bronze sm:justify-self-end">
              Open lead
            </Link>
          </>
        )}
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-dashed border-line bg-white px-3.5 py-2.5 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[#6b5d4f]">Unknown sender. They aren&apos;t in your client list yet.</span>
        {!adding && (
          <button onClick={() => setAdding(true)} className={`${ghost} !py-1 text-xs`}>
            <UserPlus size={13} /> Create contact
          </button>
        )}
      </div>
      {adding && (
        <form
          className="mt-2.5 grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setErr(await onCreate(first, last));
            setBusy(false);
          }}
        >
          <input value={first} onChange={(e) => setFirst(e.target.value)} placeholder="First name" aria-label="First name" required className={input} />
          <input value={last} onChange={(e) => setLast(e.target.value)} placeholder="Last name" aria-label="Last name" className={input} />
          <div className="flex gap-2">
            <button disabled={busy} className={`${btn} bg-walnut text-cream hover:bg-bronze`}>{busy ? "Adding…" : `Add ${email.from_address}`}</button>
            <button type="button" onClick={() => setAdding(false)} className={ghost}>Cancel</button>
          </div>
          {err && <p className="text-xs text-red-700 sm:col-span-3">{err}</p>}
        </form>
      )}
    </div>
  );
}

// The reply box, kept compact at the foot of the conversation. It keeps what is being typed; a rewritten draft arrives as a new draft and replaces it.
function Composer({
  draft,
  connected,
  ai,
  busy,
  onSend,
  onSave,
  onImprove,
  onDiscard,
}: {
  draft: DraftT;
  connected: boolean;
  ai: boolean;
  busy: boolean;
  onSend: (subject: string, body: string) => void;
  onSave: (subject: string, body: string) => void;
  onImprove: (body: string) => void;
  onDiscard: () => void;
}) {
  const [subject, setSubject] = useState(draft.subject);
  const [body, setBody] = useState(draft.body_text);
  const [saved, setSaved] = useState(true);
  const edit = (fn: () => void) => {
    fn();
    setSaved(false);
  };
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-2">
      {draft.checks.length > 0 && (
        <details className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm text-amber-900" open>
          <summary className="flex cursor-pointer items-center gap-2 font-medium">
            <AlertTriangle size={14} /> Check before you send ({draft.checks.length})
          </summary>
          <ul className="mt-1.5 list-disc space-y-0.5 pl-5">
            {draft.checks.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </details>
      )}
      {draft.status === "failed" && draft.error_summary && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{draft.error_summary}</p>}
      {draft.source === "ai" && <p className="text-xs text-bronze">Suggested by the assistant. Read it and edit anything. Nothing is sent until you press Send.</p>}
      <input aria-label="Subject" value={subject} onChange={(e) => edit(() => setSubject(e.target.value))} className={input} />
      <textarea aria-label="Message" rows={3} value={body} onChange={(e) => edit(() => setBody(e.target.value))} className={`${input} max-h-56 resize-y leading-relaxed`} />
      <div className="flex flex-wrap items-center gap-2">
        <button
          disabled={busy || !connected}
          onClick={() => onSend(subject, body)}
          title={connected ? undefined : "Gmail isn't connected yet"}
          className={`${btn} bg-walnut text-cream hover:bg-bronze disabled:hover:bg-walnut`}
        >
          <Send size={14} /> {busy ? "Working…" : "Send reply"}
        </button>
        <button
          disabled={busy}
          onClick={() => {
            onSave(subject, body);
            setSaved(true);
          }}
          className={ghost}
        >
          Save draft
        </button>
        <button disabled={!ai || busy} onClick={() => onImprove(body)} title={ai ? "Rewrite this draft" : "Available once AI is set up"} className={ghost}>
          <Sparkles size={14} /> Improve
        </button>
        <button disabled={busy} onClick={onDiscard} className="px-2 py-2 text-sm text-[#6b5d4f] underline hover:text-walnut">
          Discard
        </button>
        <span className="ml-auto text-xs text-[#6b5d4f]">{saved ? "Saved" : "Unsaved changes"}</span>
      </div>
      {!connected && <p className="text-xs text-bronze">Gmail isn&apos;t connected yet, so Send is off. Your draft is kept and can be sent once it is.</p>}
    </div>
  );
}

export function InboxView(props: Props) {
  const { rows, waiting, tab, query, tabs, page, total, listHref, pageLinks, ai, connected, loadError } = props;
  const router = useRouter();
  const [pending, start] = useTransition();

  const [selected, setSelected] = useState<string | null>(props.initialSelected);
  const [composing, setComposing] = useState(false);
  // What this session knows about each email, kept even after a refresh drops it from the list.
  const [known, setKnown] = useState<Map<string, EmailT>>(() => new Map(rows.map((r) => [r.id, r])));
  const [prevRows, setPrevRows] = useState(rows);
  if (prevRows !== rows) {
    setPrevRows(rows);
    setKnown((m) => new Map([...m, ...rows.map((r) => [r.id, r] as const)]));
  }
  const [fetched, setFetched] = useState<Record<string, PanelData>>({});
  const [links, setLinks] = useState<Record<string, LinkInfo>>({});
  const [draftsOf, setDraftsOf] = useState<Record<string, DraftT[]>>({});
  const [statusOf, setStatusOf] = useState<Record<string, string>>({});
  const [writing, setWriting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [readOf, setReadOf] = useState<Record<string, true>>({});
  const [newMail, setNewMail] = useState(false);
  const [showPlain, setShowPlain] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const started = useRef(new Set<string>());
  const baseline = useRef<{ latest: string | null } | null>(null);

  // ---- opening and closing: instant, the address bar follows ----
  const urlFor = (id: string | null) => (id ? `${listHref}${listHref.includes("?") ? "&" : "?"}e=${id}` : listHref);
  const open = (id: string) => {
    setSelected(id);
    setComposing(false);
    setNotice(null);
    setShowPlain(false);
    setShowSummary(false);
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
  const idle = !selected && !composing;
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

  // In the background, fetch the conversation (and the email itself, if it is not on this page), and who it is linked to.
  useEffect(() => {
    if (!selected || started.current.has(`p:${selected}`)) return;
    started.current.add(`p:${selected}`);
    getPanel(selected).then((d) => d && setFetched((m) => ({ ...m, [selected]: d })));
    getLinks(selected).then((l) => setLinks((m) => ({ ...m, [selected]: l })));
  }, [selected]);

  const fromServer = selected ? fetched[selected] : undefined;
  const base = selected ? (known.get(selected) ?? (fromServer ? { ...fromServer.email, email_drafts: fromServer.drafts } : null)) : null;
  const email = base && selected ? { ...base, status: statusOf[selected] ?? base.status } : null;
  const drafts = selected ? (draftsOf[selected] ?? base?.email_drafts ?? []) : [];
  const thread = fromServer?.thread ?? [];
  const openDraft = drafts.find((d) => OPEN_DRAFT.includes(d.status));
  const sentDraft = drafts.find((d) => d.status === "sent");

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
      router.refresh();
    });
  // "Suggest reply" and "Improve" use the existing assistant; they only ever produce a draft for a person to review.
  const doAssist = (instruction: string) =>
    run(async () => {
      if (!email) return;
      setWriting(true);
      const r = await writeDraft(email.id, instruction);
      putDraft(email.id, r.draft);
      setNotice(r.notice ?? null);
      setWriting(false);
    });
  const doBlank = () =>
    run(async () => {
      if (!email) return;
      const r = await writeDraft(email.id, "", true);
      putDraft(email.id, r.draft);
      router.refresh();
    });
  const doDiscard = () =>
    run(async () => {
      if (!email || !openDraft) return;
      await discardDraft(openDraft.id);
      setDraftsOf((m) => ({ ...m, [email.id]: drafts.filter((d) => d.id !== openDraft.id) }));
      setNotice("rejected");
      router.refresh();
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
  const doCreateContact = async (first: string, last: string) => {
    if (!email) return null;
    const r = await createContactFromEmail(email.id, first, last);
    if (!r.ok) return r.error ?? "That didn't work. Please try again.";
    if (r.links) setLinks((m) => ({ ...m, [email.id]: r.links! }));
    router.refresh();
    return null;
  };

  const shown = rows.filter((r) => (statusOf[r.id] ?? r.status) === r.status || tab !== "reply");
  const sender = email ? (email.direction === "outbound" ? `To: ${email.to_addresses?.[0] ?? "recipient"}` : email.from_name || email.from_address) : "";
  const messages: MsgT[] = thread.length ? thread : email ? [email as unknown as MsgT] : [];
  const latest = messages[messages.length - 1];
  const hasPanel = !!selected || composing;

  return (
    <div className="flex flex-col gap-3 lg:h-[calc(100dvh-5rem)]">
      {/* Title, search and Compose. On a phone, an open email takes the whole screen, so these step aside. */}
      <div className={`flex-wrap items-center gap-3 ${hasPanel ? "hidden lg:flex" : "flex"}`}>
        <h1 className="font-serif text-3xl">Inbox</h1>
        <form action="/inbox" className="relative order-last min-w-0 basis-full sm:order-none sm:basis-auto sm:flex-1 sm:max-w-sm">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#6b5d4f]" />
          <input
            name="q"
            defaultValue={query}
            placeholder="Search all mail"
            aria-label="Search all mail"
            className="w-full rounded-full border border-line bg-white py-2 pl-9 pr-9 text-sm outline-none focus:border-bronze"
          />
          {query && (
            <Link href="/inbox" aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-[#6b5d4f] hover:text-walnut">
              <X size={14} />
            </Link>
          )}
        </form>
        {props.unread > 0 && <span className="text-xs text-[#6b5d4f]">{props.unread} unread</span>}
        {newMail && (
          <button
            onClick={() => {
              setNewMail(false);
              router.refresh();
            }}
            className="inline-flex items-center gap-2 rounded-full bg-gold/20 px-3.5 py-1.5 text-sm text-walnut transition-colors hover:bg-gold/30"
          >
            <RefreshCw size={14} /> New mail. Show it
          </button>
        )}
        <button
          onClick={() => {
            setComposing(true);
            setSelected(null);
          }}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-walnut px-4 py-2 text-sm font-medium text-cream hover:bg-bronze"
        >
          <Plus size={16} /> Compose
        </button>
      </div>

      <div className={`-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${hasPanel ? "hidden lg:flex" : "flex"}`} role="tablist" aria-label="Folders">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={t.href}
            role="tab"
            aria-selected={tab === t.key}
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1 text-sm ${
              tab === t.key ? "border-walnut bg-walnut text-cream" : "border-line bg-card text-[#6b5d4f] hover:text-walnut"
            }`}
          >
            {t.label}
            {t.count > 0 && <span className={`rounded-full px-1.5 text-xs ${tab === t.key ? "bg-cream/20" : "bg-line"}`}>{t.count}</span>}
          </Link>
        ))}
      </div>
      {query && (
        <p className={`text-sm text-[#6b5d4f] ${hasPanel ? "hidden lg:block" : ""}`}>
          {total} result{total === 1 ? "" : "s"} for &ldquo;{query}&rdquo; in all mail
        </p>
      )}
      {loadError && <p className="text-red-700">Could not load the inbox.</p>}

      <div className="lg:grid lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(320px,400px)_minmax(0,1fr)] lg:gap-4">
        <section className={`min-w-0 lg:min-h-0 lg:overflow-y-auto lg:pr-1 ${hasPanel ? "hidden lg:block" : ""}`} aria-label="Emails">
          {tab === "waiting" ? (
            waiting.length === 0 ? (
              <div className="rounded-2xl border border-line bg-card px-6 py-10 text-center text-sm text-[#6b5d4f]">
                No one is overdue. Everyone you replied to has answered, or it hasn&apos;t been 3 days yet.
              </div>
            ) : (
              <ul className="grid grid-cols-[minmax(0,1fr)] gap-1.5">
                {waiting.map((w) => (
                  <li key={w.emailId} className={`rounded-xl border bg-card p-3 transition-colors hover:border-bronze ${selected === w.emailId ? "border-bronze bg-cream/60" : "border-line"}`}>
                    <button onClick={() => open(w.emailId)} className="block w-full text-left">
                      <p className="truncate text-sm font-medium">{w.name}</p>
                      <p className="truncate text-sm">{w.subject || "(no subject)"}</p>
                      <p className="mt-1 flex items-center gap-1.5 text-xs text-[#6b5d4f]">
                        <CalendarClock size={13} /> You replied {w.daysWaiting} days ago. No answer yet.
                      </p>
                    </button>
                    <button onClick={() => doFollowUp(w)} className="mt-2 rounded-lg bg-walnut px-3 py-1 text-xs font-medium text-cream hover:bg-bronze">
                      Draft a follow-up
                    </button>
                  </li>
                ))}
              </ul>
            )
          ) : shown.length === 0 ? (
            <div className="rounded-2xl border border-line bg-card px-6 py-10 text-center text-sm text-[#6b5d4f]">
              {tab === "reply" ? "Nothing needs a reply right now." : tab === "sent" ? "No sent mail yet. Replies appear here once Gmail is connected and they are sent." : "Nothing here yet."}
            </div>
          ) : (
            <ul className="grid grid-cols-[minmax(0,1fr)] gap-1.5">
              {shown.map((e) => {
                const sent = e.direction === "outbound";
                const ds = draftsOf[e.id] ?? e.email_drafts;
                const hasDraft = ds?.some((d) => OPEN_DRAFT.includes(d.status));
                const unread = !sent && !e.read_at && !readOf[e.id];
                const pr = priorityOf(e.priority);
                const cat = categoryOf(e.category);
                // Only true states: it is waiting on us when it is open, inbound, and not marked as needing no reply.
                const needsReply = !sent && (statusOf[e.id] ?? e.status) === "open" && e.needs_reply !== false && tab !== "reply";
                const who = sent ? `To: ${e.to_addresses?.[0] ?? "recipient"}` : e.from_name || e.from_address;
                return (
                  <li key={e.id}>
                    <button
                      onClick={() => open(e.id)}
                      aria-current={selected === e.id}
                      className={`relative block w-full overflow-hidden rounded-xl border py-2.5 pl-4 pr-3 text-left transition-colors before:absolute before:inset-y-0 before:left-0 before:w-1 hover:border-bronze ${pr.edge} ${
                        selected === e.id ? "border-bronze bg-cream/70" : unread ? "border-line bg-white" : "border-line bg-card"
                      }`}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className={`flex min-w-0 items-center gap-1.5 text-sm ${unread ? "font-semibold" : "font-medium"}`}>
                          {unread && <span aria-label="Unread" className="h-2 w-2 shrink-0 rounded-full bg-bronze" />}
                          <span className="truncate">{who}</span>
                        </span>
                        <span className="shrink-0 text-xs text-[#6b5d4f]" suppressHydrationWarning>{short(e.received_at)}</span>
                      </span>
                      <span className={`mt-0.5 block truncate text-sm ${unread ? "font-semibold" : ""}`}>{e.subject || "(no subject)"}</span>
                      <span className="block truncate text-xs text-[#6b5d4f]">{e.summary ?? e.body_text.replace(/\s+/g, " ").slice(0, 120)}</span>
                      {(sent || hasDraft || unread || needsReply || (e.priority === "urgent" || e.priority === "high") || cat || e.inbox_attachments?.length > 0 || e.analysis_status === "pending") && (
                        <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          {unread && <span className="rounded-full bg-bronze px-2 py-0.5 text-xs font-semibold text-white">Unread</span>}
                          {needsReply && <span className="rounded-full border border-[#C2482F]/50 bg-[#FBEDE8] px-2 py-0.5 text-xs font-medium text-[#A23A25]">Needs reply</span>}
                          {hasDraft && (
                            <span className="inline-flex items-center gap-1 rounded-full border border-dashed border-[#8A5F0F]/60 bg-[#F8EBCB] px-2 py-0.5 text-xs font-medium text-[#7A5410]">
                              <PenLine size={10} /> Draft
                            </span>
                          )}
                          {sent && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-walnut px-2 py-0.5 text-xs font-medium text-cream">
                              <Send size={10} /> Sent
                            </span>
                          )}
                          {(e.priority === "urgent" || e.priority === "high") && <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${pr.chip}`}>{pr.label}</span>}
                          {cat && <span className={`rounded-full px-2 py-0.5 text-xs ${cat.chip}`}>{cat.label}</span>}
                          {e.inbox_attachments?.length > 0 && (
                            <span className="inline-flex items-center gap-1 text-xs text-[#6b5d4f]">
                              <Paperclip size={11} /> {e.inbox_attachments.length}
                            </span>
                          )}
                          {e.analysis_status === "pending" && <span className="text-xs text-[#6b5d4f]">Analyzing…</span>}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <Pager page={page} total={total} hrefFor={(p) => pageLinks[p - 1] ?? listHref} />
        </section>

        {composing ? (
          <div className="flex max-h-[calc(100dvh-10rem)] min-h-0 flex-col lg:max-h-[calc(100dvh-11rem)] lg:self-start">
            <Compose connected={connected} onClose={() => setComposing(false)} />
          </div>
        ) : (
          <section
            className={`min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border border-line bg-card ${selected ? "flex max-h-[calc(100dvh-10rem)] lg:max-h-[calc(100dvh-11rem)] lg:self-start" : "hidden lg:flex lg:h-full"}`}
            aria-label="Selected email"
          >
            {!selected ? (
              <div className="m-auto grid justify-items-center gap-2 px-6 text-center text-sm text-[#6b5d4f]">
                <InboxIcon size={28} className="text-bronze" />
                <p>Pick an email to read the conversation and reply.</p>
                <p className="text-xs">Or press Compose to write a new message.</p>
              </div>
            ) : !email ? (
              <Skeleton />
            ) : (
              <div key={email.id} className="panel-in flex min-h-0 min-w-0 max-h-[calc(100dvh-10rem)] flex-col lg:max-h-[calc(100dvh-11rem)]">
                {/* Header and actions stay in view; only the conversation scrolls. */}
                <div className="border-b border-line px-4 py-3">
                  <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-walnut font-serif text-gold">{initials(sender.replace(/^To: /, ""))}</span>
                    <div className="min-w-0 flex-1 basis-40">
                      <h2 className="truncate font-serif text-xl leading-tight">{email.subject || "(no subject)"}</h2>
                      <p className="truncate text-xs text-[#6b5d4f]" suppressHydrationWarning>
                        {sender}
                        {email.direction === "inbound" && email.from_name ? ` <${email.from_address}>` : ""} · {long(email.received_at)}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap justify-end gap-1.5 max-sm:w-full max-sm:justify-start">
                      {email.direction === "inbound" &&
                        (email.status === "open" ? (
                          <>
                            <button disabled={pending} onClick={() => doStatus("handled")} className={`${ghost} !px-2.5 !py-1.5`}>
                              <Check size={14} /> <span className="hidden sm:inline">Mark handled</span>
                            </button>
                            <button disabled={pending} onClick={() => doStatus("archived")} className={`${ghost} !px-2.5 !py-1.5`}>
                              Archive
                            </button>
                          </>
                        ) : (
                          <button disabled={pending} onClick={() => doStatus("open")} className={`${ghost} !px-2.5 !py-1.5`}>
                            Reopen
                          </button>
                        ))}
                      <button onClick={close} aria-label="Close" className={`${ghost} !px-2.5 !py-1.5 text-[#6b5d4f]`}>
                        <X size={14} /> <span className="lg:hidden">Back</span>
                      </button>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {email.direction === "outbound" && <span className="rounded-full bg-walnut/10 px-2.5 py-0.5 text-xs font-medium text-walnut">Sent</span>}
                    {email.priority && email.priority !== "normal" && email.priority !== "low" && (
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${priorityOf(email.priority).chip}`}>{priorityOf(email.priority).label}</span>
                    )}
                    {categoryOf(email.category) && <span className={`rounded-full px-2.5 py-0.5 text-xs ${categoryOf(email.category)!.chip}`}>{categoryOf(email.category)!.label}</span>}
                    {email.needs_reply === false && <span className="rounded-full bg-line px-2.5 py-0.5 text-xs">No reply needed</span>}
                    {email.status !== "open" && email.direction === "inbound" && <span className="rounded-full bg-line px-2.5 py-0.5 text-xs">{email.status === "handled" ? "Handled" : "Archived"}</span>}
                  </div>
                </div>

                <div className="min-h-0 overflow-y-auto px-4 py-3">
                  <div className="grid grid-cols-[minmax(0,1fr)] gap-3">
                    <LinkCard key={`${email.id}:${links[email.id]?.contact?.id ?? ""}`} email={email} info={links[email.id]} onCreate={doCreateContact} />
                    {notice && NOTICES[notice] && <p className="rounded-lg border border-gold/40 bg-gold/10 px-3.5 py-2 text-sm" role="status">{NOTICES[notice]}</p>}

                    {showSummary && (
                      <div className="rounded-xl border border-gold/40 bg-gold/[0.07] px-3.5 py-2.5 text-sm">
                        {email.summary ? (
                          <>
                            <p className="leading-relaxed">{email.summary}</p>
                            {email.suggested_action && <p className="mt-1.5"><span className="text-[#6b5d4f]">Next step: </span>{email.suggested_action}</p>}
                            <p className="mt-1.5 text-xs text-[#6b5d4f]">AI summary. Please check it against the email.</p>
                          </>
                        ) : (
                          <p className="text-[#6b5d4f]">No summary has been prepared for this conversation.</p>
                        )}
                      </div>
                    )}

                    {messages.length > 1 && (
                      <p className="text-xs uppercase tracking-[0.15em] text-[#6b5d4f]">{messages.length} messages in this conversation</p>
                    )}
                    {messages.slice(0, -1).map((m) => (
                      <MessageCard key={m.id} m={m} defaultOpen={false} />
                    ))}
                    {latest && email.body_html && !showPlain && latest.id === email.id ? (
                      <div className="grid gap-1.5">
                        <HtmlBody html={email.body_html} />
                        <p className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#6b5d4f]">
                          <span>Pictures are hidden to protect your privacy.</span>
                          <button onClick={() => setShowPlain(true)} className="underline hover:text-walnut">
                            Show as plain text
                          </button>
                        </p>
                      </div>
                    ) : (
                      latest && (
                        <>
                          <MessageCard key={latest.id} m={latest} defaultOpen />
                          {email.body_html && latest.id === email.id && (
                            <button onClick={() => setShowPlain(false)} className="w-fit text-xs text-[#6b5d4f] underline hover:text-walnut">
                              Show formatted
                            </button>
                          )}
                        </>
                      )
                    )}
                    <Attachments files={(fromServer?.email.inbox_attachments ?? email.inbox_attachments ?? []) as AttachT[]} />
                  </div>
                </div>

                {email.direction === "inbound" && (
                  <div className="max-h-[32dvh] shrink-0 lg:max-h-[45dvh] overflow-y-auto border-t border-line bg-cream/50 px-4 py-3">
                    <div className="mb-2 flex flex-wrap items-center gap-1.5">
                      <span className="mr-1 text-xs font-medium uppercase tracking-[0.15em] text-[#6b5d4f]">Reply</span>
                      {/* AI actions: off until an AI key is added. Anything they produce is a draft that a person reviews. */}
                      <button
                        disabled={!ai}
                        onClick={() => setShowSummary((v) => !v)}
                        title={ai ? "Show the summary" : "Available once AI is set up"}
                        className={`${ghost} !px-2.5 !py-1 text-xs`}
                      >
                        <Sparkles size={12} /> Summarize
                      </button>
                      <button
                        disabled={!ai || pending || !!openDraft}
                        onClick={() => doAssist("")}
                        title={ai ? (openDraft ? "A draft is already open. Use Improve." : "Draft a suggested reply") : "Available once AI is set up"}
                        className={`${ghost} !px-2.5 !py-1 text-xs`}
                      >
                        <Sparkles size={12} /> {writing ? "Writing…" : "Suggest reply"}
                      </button>
                      {!ai && <span className="text-xs text-[#6b5d4f]">AI assistance isn&apos;t set up yet. Suggestions are always reviewed before sending.</span>}
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
                        onImprove={(body) => doAssist(`Improve this draft. Keep its meaning and facts, and make it clearer and warmer:\n${body}`)}
                        onDiscard={doDiscard}
                      />
                    ) : (
                      <div className="flex flex-wrap items-center gap-2">
                        {sentDraft && (
                          <p className="flex items-center gap-1.5 text-sm" suppressHydrationWarning>
                            <Check size={15} className="text-bronze" /> Reply sent {sentDraft.sent_at ? long(sentDraft.sent_at) : ""}.
                          </p>
                        )}
                        <button disabled={pending} onClick={doBlank} className={`${btn} bg-walnut text-cream hover:bg-bronze`}>
                          <PenLine size={14} /> {sentDraft ? "Write another reply" : "Write reply"}
                        </button>
                        {email.status !== "open" && <span className="text-xs text-[#6b5d4f]">This email is closed. You can still write a reply.</span>}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
