import { Suspense } from "react";
import Link from "next/link";
import { CalendarClock, Mail } from "lucide-react";
import { findWaitingOnCustomers } from "@/lib/assistant/waiting";
import { createClient } from "@/lib/supabase/server";
import { Card, PageHeader, Pill } from "../ui";
import { PAGE_SIZE, Pager, pageOf, rangeOf } from "../pager";
import { draftFollowUp } from "./actions";
import { EmailPanel, loadEmailPanel } from "./email-panel";

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

function PanelSkeleton() {
  return (
    <div className="animate-pulse space-y-4" aria-busy="true" aria-label="Loading email">
      <div className="h-36 rounded-2xl border border-line bg-card" />
      <div className="h-24 rounded-2xl border border-line bg-card" />
      <div className="h-48 rounded-2xl border border-line bg-card" />
    </div>
  );
}

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ f?: string; p?: string; e?: string; notice?: string }>;
}) {
  const sp = await searchParams;
  const f = TABS.some((t) => t.key === sp.f) ? (sp.f as (typeof TABS)[number]["key"]) : "reply";
  const page = pageOf(sp.p);
  const selected = sp.e && /^[0-9a-f-]{36}$/i.test(sp.e) ? sp.e : null;
  const supabase = await createClient();

  // The open email starts loading right now, alongside the list, instead of after it.
  const panelData = selected ? loadEmailPanel(supabase, selected) : null;

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

  // The list address (this tab, this page) with or without an email open beside it.
  const listHref = (key: string, p = 1, email?: string | null) => {
    const qs = new URLSearchParams({
      ...(key === "reply" ? {} : { f: key }),
      ...(p > 1 ? { p: String(p) } : {}),
      ...(email ? { e: email } : {}),
    }).toString();
    return qs ? `/inbox?${qs}` : "/inbox";
  };
  const back = listHref(f, page);
  const day = (iso: string) =>
    new Date(iso).toLocaleString("en-CA", { timeZone: "America/Edmonton", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

  return (
    <div>
      <PageHeader eyebrow="Replies drafted for you" title="Inbox" />

      {/* On a phone, an open email takes the whole screen; on a computer the list and the email sit side by side. */}
      <div className={`mb-4 flex-wrap gap-2 ${selected ? "hidden lg:flex" : "flex"}`}>
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={listHref(t.key)}
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

      <div className={selected ? "lg:grid lg:grid-cols-[minmax(300px,380px)_minmax(0,1fr)] lg:items-start lg:gap-6" : ""}>
        <section className={`min-w-0 ${selected ? "hidden lg:block" : ""}`} aria-label="Emails">
          {f === "waiting" ? (
            waiting.length === 0 ? (
              <Card className="px-6 py-10 text-center text-sm text-muted">
                No one is overdue. Everyone you replied to has answered, or it hasn&apos;t been 3 days yet.
              </Card>
            ) : (
              <div className="grid gap-2">
                {waiting.map((w) => (
                  <Card key={w.emailId} className={`p-4 transition-colors hover:border-bronze ${selected === w.emailId ? "border-bronze bg-cream/60" : ""}`}>
                    <Link href={listHref(f, page, w.emailId)} scroll={false} className="block">
                      <p className="truncate font-medium">{w.name}</p>
                      <p className="truncate text-sm">{w.subject || "(no subject)"}</p>
                      <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted">
                        <CalendarClock size={13} /> You replied {w.daysWaiting} days ago. No answer yet.
                      </p>
                    </Link>
                    <form action={draftFollowUp.bind(null, w.emailId, w.daysWaiting)} className="mt-2">
                      <button className="rounded-lg bg-walnut px-3 py-1.5 text-xs font-medium text-cream hover:bg-bronze">Draft a follow-up</button>
                    </form>
                  </Card>
                ))}
              </div>
            )
          ) : rows.length === 0 ? (
            <Card className="px-6 py-10 text-center text-sm text-muted">{f === "reply" ? "Nothing needs a reply right now." : "Nothing here yet."}</Card>
          ) : (
            <div className="grid gap-2">
              {rows.map((e) => {
                const draftReady = e.email_drafts?.some((d) => OPEN_DRAFT.includes(d.status));
                return (
                  <Link key={e.id} href={listHref(f, page, e.id)} scroll={false}>
                    <Card className={`p-4 transition-colors hover:border-bronze ${selected === e.id ? "border-bronze bg-cream/60" : ""} ${selected ? "" : "lg:grid lg:grid-cols-[220px_minmax(0,1fr)_auto] lg:items-center lg:gap-x-6 lg:px-5 lg:py-3.5"}`}>
                      <div className={`flex items-center justify-between gap-2 ${selected ? "" : "lg:block"}`}>
                        <p className="truncate font-medium">{e.from_name || e.from_address}</p>
                        <span className={`shrink-0 text-xs text-muted ${selected ? "" : "lg:hidden"}`}>{day(e.received_at)}</span>
                      </div>
                      <div className="min-w-0">
                        <p className="mt-0.5 truncate text-sm lg:mt-0">{e.subject || "(no subject)"}</p>
                        <p className="mt-1 line-clamp-2 text-xs text-muted lg:line-clamp-1">{e.summary ?? e.body_text.replace(/\s+/g, " ").slice(0, 160)}</p>
                      </div>
                      <span className={`hidden shrink-0 text-xs text-muted ${selected ? "" : "lg:block"}`}>{day(e.received_at)}</span>
                      <div className={`mt-2 flex flex-wrap items-center gap-1.5 ${selected ? "" : "lg:col-start-1 lg:row-start-2 lg:mt-1"}`}>
                        {e.priority && e.priority !== "normal" && e.priority !== "low" && <Pill kind={priorityPill[e.priority]}>{e.priority}</Pill>}
                        {e.category && <span className="text-xs capitalize text-muted">{pretty(e.category)}</span>}
                        {e.analysis_status === "pending" && <span className="text-xs text-muted">Analyzing…</span>}
                        {draftReady && <span className="rounded-full bg-gold/15 px-2 py-0.5 text-xs text-bronze">Draft ready</span>}
                      </div>
                    </Card>
                  </Link>
                );
              })}
            </div>
          )}
          <Pager page={page} total={f === "waiting" ? waitingAll.length : total} hrefFor={(p) => listHref(f, p)} />
        </section>

        <section
          className={`min-w-0 ${selected ? "" : "hidden lg:block"} lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto lg:pr-1`}
          aria-label="Selected email"
        >
          {selected ? (
            <Suspense key={selected} fallback={<PanelSkeleton />}>
              <div className="panel-in">
                <EmailPanel id={selected} back={back} notice={sp.notice} data={panelData!} />
              </div>
            </Suspense>
          ) : (
            <div className="hidden rounded-2xl border border-dashed border-line px-8 py-24 text-center lg:block">
              <Mail size={28} strokeWidth={1.4} className="mx-auto text-bronze" />
              <p className="mt-3 font-serif text-xl">Pick an email</p>
              <p className="mt-1 text-sm text-muted">It opens here with a reply already drafted for you to check.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
