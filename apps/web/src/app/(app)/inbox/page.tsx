import Link from "next/link";
import { CalendarClock } from "lucide-react";
import { findWaitingOnCustomers } from "@/lib/assistant/waiting";
import { createClient } from "@/lib/supabase/server";
import { Card, PageHeader, Pill } from "../ui";
import { PAGE_SIZE, Pager, pageOf, rangeOf } from "../pager";
import { draftFollowUp } from "./actions";

// Three places, each answering one question: what do I owe a reply to, who owes me one, and what is finished.
const TABS = [
  { key: "reply", label: "Needs reply" },
  { key: "waiting", label: "Waiting on customer" },
  { key: "done", label: "Done" },
] as const;

const priorityPill: Record<string, string> = { urgent: "hot", high: "warm", normal: "cold", low: "cold" };
const pretty = (s: string) => s.replaceAll("_", " ");
const OPEN_DRAFT = ["draft", "approved", "failed"];

type Row = {
  id: string;
  from_address: string;
  from_name: string | null;
  subject: string;
  body_text: string;
  received_at: string;
  analysis_status: string;
  category: string | null;
  priority: string | null;
  needs_reply: boolean | null;
  summary: string | null;
  contact_id: string | null;
  project_id: string | null;
  email_drafts: { status: string }[];
};

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ f?: string; p?: string; notice?: string }>;
}) {
  const sp = await searchParams;
  const f = TABS.some((t) => t.key === sp.f) ? (sp.f as (typeof TABS)[number]["key"]) : "reply";
  const page = pageOf(sp.p);
  const notice = sp.notice;
  const supabase = await createClient();

  // One batch to the database: the badge counts, the waiting list, and this tab's page of emails.
  // "Needs reply" includes emails the AI has not looked at yet (needs_reply unknown), so nothing is hidden while AI is off.
  const needsReplyCount = supabase
    .from("inbox_emails")
    .select("id", { count: "exact", head: true })
    .eq("direction", "inbound")
    .eq("status", "open")
    .or("needs_reply.is.null,needs_reply.eq.true");

  let list = null;
  if (f !== "waiting") {
    let q = supabase
      .from("inbox_emails")
      .select(
        "id, from_address, from_name, subject, body_text, received_at, analysis_status, category, priority, needs_reply, summary, contact_id, project_id, email_drafts(status)",
        { count: "exact" },
      )
      .eq("direction", "inbound");
    q =
      f === "reply"
        ? q.eq("status", "open").or("needs_reply.is.null,needs_reply.eq.true")
        : q.or("status.in.(handled,archived),and(status.eq.open,needs_reply.eq.false)");
    const [from, to] = rangeOf(page);
    list = q.order("received_at", { ascending: false }).range(from, to);
  }

  const [replyBadge, waitingAll, res] = await Promise.all([
    needsReplyCount.then((r) => r.count ?? 0),
    findWaitingOnCustomers(supabase),
    list,
  ]);
  const error = !!res?.error;
  const rows = (res?.data ?? []) as unknown as Row[];
  const total = res?.count ?? 0;
  const waiting = waitingAll.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const badge: Record<string, number> = { reply: replyBadge, waiting: waitingAll.length };
  const href = (key: string, p = 1) => `/inbox?${new URLSearchParams({ ...(key === "reply" ? {} : { f: key }), ...(p > 1 ? { p: String(p) } : {}) })}`.replace(/\?$/, "");

  return (
    <div>
      <PageHeader eyebrow="Inbox" title="Email Assistant" />

      {notice === "drafted" && (
        <p className="mb-4 rounded-xl border border-gold/40 bg-gold/10 px-4 py-3 text-sm">Follow-up draft ready. Open it to review.</p>
      )}

      <div className="mb-4 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={href(t.key)}
            className={`inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm ${
              f === t.key ? "border-walnut bg-walnut text-cream" : "border-line bg-card text-muted hover:text-walnut"
            }`}
          >
            {t.label}
            {badge[t.key] > 0 && (
              <span className={`rounded-full px-1.5 text-xs ${f === t.key ? "bg-cream/20" : "bg-line"}`}>{badge[t.key]}</span>
            )}
          </Link>
        ))}
      </div>
      {error && <p className="mb-4 text-red-700">Could not load the inbox.</p>}

      {f === "waiting" ? (
        waiting.length === 0 ? (
          <Card className="px-6 py-10 text-center text-sm text-muted">No one is overdue. Everyone you replied to has answered, or it hasn&apos;t been 3 days yet.</Card>
        ) : (
          <div className="grid gap-3">
            {waiting.map((w) => (
              <Card key={w.emailId} className="flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5">
                <div className="min-w-0">
                  <p className="font-medium">{w.name}</p>
                  <p className="truncate text-sm">{w.subject || "(no subject)"}</p>
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-muted">
                    <CalendarClock size={13} /> You replied {w.daysWaiting} days ago. No answer yet.
                  </p>
                </div>
                <div className="flex gap-2">
                  <Link href={`/inbox/${w.emailId}`} className="rounded-lg border border-line px-4 py-2 text-sm hover:border-bronze">
                    Open
                  </Link>
                  <form action={draftFollowUp.bind(null, w.emailId, w.daysWaiting)}>
                    <button className="rounded-lg bg-walnut px-4 py-2 text-sm font-medium text-cream hover:bg-bronze">Draft a follow-up</button>
                  </form>
                </div>
              </Card>
            ))}
          </div>
        )
      ) : rows.length === 0 ? (
        <Card className="px-6 py-10 text-center text-sm text-muted">
          {f === "reply" ? "Nothing needs a reply right now." : "Nothing here yet."}
        </Card>
      ) : (
        <div className="grid gap-3">
          {rows.map((e) => (
            <Link key={e.id} href={`/inbox/${e.id}`}>
              <Card className="p-4 hover:border-bronze sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">
                    {e.from_name || e.from_address}
                    {e.contact_id && <span className="ml-2 text-xs font-normal text-bronze">known contact</span>}
                  </p>
                  <div className="flex items-center gap-2">
                    {e.priority && <Pill kind={priorityPill[e.priority]}>{e.priority}</Pill>}
                    <span className="text-xs text-muted">
                      {new Date(e.received_at).toLocaleString("en-CA", {
                        timeZone: "America/Edmonton",
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                </div>
                <p className="mt-1 text-sm">{e.subject || "(no subject)"}</p>
                <p className="mt-2 text-sm text-muted">{e.summary ?? e.body_text.replace(/\s+/g, " ").slice(0, 180)}</p>
                <p className="mt-2 text-xs capitalize text-muted">
                  {e.category ? pretty(e.category) : e.analysis_status === "pending" ? "Analyzing…" : "Not analyzed"}
                  {e.needs_reply ? " · needs reply" : ""}
                  {e.email_drafts?.some((d) => OPEN_DRAFT.includes(d.status)) ? " · draft ready" : ""}
                </p>
              </Card>
            </Link>
          ))}
        </div>
      )}
      <Pager page={page} total={f === "waiting" ? waitingAll.length : total} hrefFor={(p) => href(f, p)} />
    </div>
  );
}
