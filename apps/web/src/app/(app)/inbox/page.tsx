import Link from "next/link";
import { CalendarClock, Newspaper, Settings2 } from "lucide-react";
import { findUnbookedLeads, findWaitingOnCustomers } from "@/lib/assistant/waiting";
import { createClient } from "@/lib/supabase/server";
import { Card, PageHeader, Pill } from "../ui";
import { draftFollowUp } from "./actions";

const filters = [
  { key: "reply", label: "Needs reply" },
  { key: "drafts", label: "Drafts ready" },
  { key: "waiting", label: "Waiting on customer" },
  { key: "open", label: "All open" },
  { key: "handled", label: "Handled" },
];

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

function Tile({ n, label, href }: { n: number; label: string; href: string }) {
  return (
    <Link href={href}>
      <Card className="p-4 transition-colors hover:border-bronze">
        <p className="font-serif text-3xl leading-none">{n}</p>
        <p className="mt-2 text-xs text-muted">{label}</p>
      </Card>
    </Link>
  );
}

export default async function InboxPage({ searchParams }: { searchParams: Promise<{ f?: string; notice?: string }> }) {
  const { f = "reply", notice } = await searchParams;
  const supabase = await createClient();

  // The strip at the top: what needs you, at a glance.
  const [needReply, draftsReady, waiting, unbooked] = await Promise.all([
    supabase.from("inbox_emails").select("id", { count: "exact", head: true }).eq("direction", "inbound").eq("status", "open").eq("needs_reply", true).then((r) => r.count ?? 0),
    supabase.from("email_drafts").select("id", { count: "exact", head: true }).in("status", OPEN_DRAFT).then((r) => r.count ?? 0),
    findWaitingOnCustomers(supabase),
    findUnbookedLeads(supabase),
  ]);

  let rows: Row[] = [];
  let error = false;
  if (f !== "waiting") {
    let q = supabase
      .from("inbox_emails")
      .select(
        `id, from_address, from_name, subject, body_text, received_at, analysis_status, category, priority, needs_reply, summary, contact_id, project_id, email_drafts${f === "drafts" ? "!inner" : ""}(status)`,
      )
      .eq("direction", "inbound")
      .order("received_at", { ascending: false })
      .limit(100);
    if (f === "handled") q = q.in("status", ["handled", "archived"]);
    else q = q.eq("status", "open");
    if (f === "reply") q = q.eq("needs_reply", true);
    if (f === "drafts") q = q.in("email_drafts.status", OPEN_DRAFT);
    const res = await q;
    error = !!res.error;
    rows = (res.data ?? []) as unknown as Row[];
  }

  return (
    <div>
      <PageHeader eyebrow="Inbox" title="Email Assistant">
        <div className="flex flex-wrap gap-2">
          <Link href="/inbox/digest" className="inline-flex items-center gap-2 rounded-lg border border-line px-4 py-2.5 text-sm hover:border-bronze">
            <Newspaper size={16} /> Morning brief
          </Link>
          <Link href="/inbox/settings" className="inline-flex items-center gap-2 rounded-lg border border-line px-4 py-2.5 text-sm hover:border-bronze">
            <Settings2 size={16} /> Teach the assistant
          </Link>
        </div>
      </PageHeader>

      {notice === "drafted" && (
        <p className="mb-4 rounded-xl border border-gold/40 bg-gold/10 px-4 py-3 text-sm">Follow-up draft ready. Open it to review.</p>
      )}

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile n={needReply} label="Need a reply" href="/inbox" />
        <Tile n={draftsReady} label="Drafts ready to approve" href="/inbox?f=drafts" />
        <Tile n={waiting.length} label="Waiting on customers" href="/inbox?f=waiting" />
        <Tile n={unbooked.length} label="Estimates, no booking yet" href="/leads?f=nobooking" />
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {filters.map((x) => (
          <Link
            key={x.key}
            href={x.key === "reply" ? "/inbox" : `/inbox?f=${x.key}`}
            className={`rounded-full border px-4 py-1.5 text-sm ${
              f === x.key ? "border-walnut bg-walnut text-cream" : "border-line bg-card text-muted hover:text-walnut"
            }`}
          >
            {x.label}
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
          {f === "reply" ? "Nothing needs a reply right now." : f === "drafts" ? "No drafts are waiting for you." : "No emails here."}
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
    </div>
  );
}
