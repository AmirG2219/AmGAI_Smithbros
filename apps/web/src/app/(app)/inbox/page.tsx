import { replyAiEnabled } from "@/lib/assistant/draft";
import { gmailSendConfigured } from "@/lib/assistant/send";
import { findWaitingOnCustomers } from "@/lib/assistant/waiting";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "../ui";
import { PAGE_SIZE, pageOf, rangeOf } from "../pager";
import { InboxView, type TabT } from "./inbox-view";
import type { EmailT } from "./types";

// Three places, each answering one question: what do I owe a reply to, who owes me one, and what is finished.
const TABS = [
  { key: "reply", label: "Needs reply" },
  { key: "waiting", label: "Waiting on customer" },
  { key: "done", label: "Done" },
] as const;

// Everything the side panel shows is fetched here with the list, so opening an email later needs no waiting.
const COLUMNS =
  "id, direction, status, from_address, from_name, subject, body_text, received_at, provider_thread_id, analysis_status, category, priority, needs_reply, summary, suggested_action, read_at, contact_id, project_id, contacts(id, first_name, last_name), inbox_attachments(id, filename, content_type, size_bytes), email_drafts(id, status, subject, body_text, checks, source, error_summary, sent_at)";

type RawRow = Omit<EmailT, "contacts"> & { contacts: EmailT["contacts"] | EmailT["contacts"][] };

export default async function InboxPage({ searchParams }: { searchParams: Promise<{ f?: string; p?: string; e?: string; q?: string }> }) {
  const sp = await searchParams;
  const f = TABS.some((t) => t.key === sp.f) ? (sp.f as (typeof TABS)[number]["key"]) : "reply";
  const page = pageOf(sp.p);
  const term = (sp.q ?? "").replace(/[%,()*\\]/g, " ").trim().slice(0, 80);
  const selected = sp.e && /^[0-9a-f-]{36}$/i.test(sp.e) ? sp.e : null;
  const supabase = await createClient();

  // One batch to the database: the badge counts, the waiting list, and this tab's page of emails.
  // "Needs reply" includes emails the AI has not looked at yet (needs_reply unknown), so nothing is hidden while AI is off.
  const needsReplyCount = supabase
    .from("inbox_emails")
    .select("id", { count: "exact", head: true })
    .eq("direction", "inbound")
    .eq("status", "open")
    .or("needs_reply.is.null,needs_reply.eq.true");

  const unreadCount = supabase
    .from("inbox_emails")
    .select("id", { count: "exact", head: true })
    .eq("direction", "inbound")
    .is("read_at", null);

  let list = null;
  if (term || f !== "waiting") {
    let q = supabase.from("inbox_emails").select(COLUMNS, { count: "exact" }).eq("direction", "inbound");
    if (term) {
      // A search looks through all mail, whatever tab it is in.
      q = q.or(`from_name.ilike.%${term}%,from_address.ilike.%${term}%,subject.ilike.%${term}%,body_text.ilike.%${term}%,summary.ilike.%${term}%`);
    } else {
      q =
        f === "reply"
          ? q.eq("status", "open").or("needs_reply.is.null,needs_reply.eq.true")
          : q.or("status.in.(handled,archived),and(status.eq.open,needs_reply.eq.false)");
    }
    const [from, to] = rangeOf(page);
    list = q.order("received_at", { ascending: false }).range(from, to);
  }

  const [replyBadge, unread, waitingAll, res] = await Promise.all([
    needsReplyCount.then((r) => r.count ?? 0),
    unreadCount.then((r) => r.count ?? 0),
    findWaitingOnCustomers(supabase),
    list,
  ]);

  const rows = ((res?.data ?? []) as unknown as RawRow[]).map((r) => ({
    ...r,
    contacts: Array.isArray(r.contacts) ? (r.contacts[0] ?? null) : r.contacts,
  })) as EmailT[];
  const waiting = waitingAll.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const count: Record<string, number> = { reply: replyBadge, waiting: waitingAll.length, done: 0 };

  const href = (key: string, p = 1, withQuery = false) => {
    const qs = new URLSearchParams({
      ...(key === "reply" ? {} : { f: key }),
      ...(withQuery && term ? { q: term } : {}),
      ...(p > 1 ? { p: String(p) } : {}),
    }).toString();
    return qs ? `/inbox?${qs}` : "/inbox";
  };
  const tabs: TabT[] = TABS.map((t) => ({ ...t, count: count[t.key], href: href(t.key) }));
  const searching = !!term;
  const totalRows = searching ? (res?.count ?? 0) : f === "waiting" ? waitingAll.length : (res?.count ?? 0);
  const pages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));

  return (
    <div>
      <PageHeader eyebrow="Replies drafted for you" title="Inbox" />
      <InboxView
        key={`${f}:${page}:${term}`}
        rows={rows}
        waiting={waiting}
        tab={searching ? "search" : f}
        query={term}
        unread={unread}
        tabs={tabs}
        page={page}
        total={totalRows}
        listHref={href(f, page, true)}
        pageLinks={Array.from({ length: pages }, (_, i) => href(f, i + 1, true))}
        initialSelected={selected}
        ai={replyAiEnabled()}
        connected={gmailSendConfigured()}
        loadError={!!res?.error}
      />
    </div>
  );
}
