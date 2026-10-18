import { CalendarCheck, Flame, Inbox, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { loadAttention } from "@/lib/dashboard/attention";
import { createClient } from "@/lib/supabase/server";
import { getMe } from "@/lib/supabase/session";
import { LEAD_COLUMNS, LeadsTable, type LeadRow } from "./leads-table";
import { Card, PageHeader, Pill, greeting } from "./ui";

const priorityPill: Record<string, string> = { urgent: "hot", high: "warm", normal: "cold", low: "cold" };

export default async function Overview() {
  const supabase = await createClient();
  const count = (q: PromiseLike<{ count: number | null }>) => q.then((r) => r.count ?? 0);
  const projects = () => supabase.from("projects").select("id", { count: "exact", head: true });

  // One parallel batch: a page never waits on more than one round trip to the database.
  const [newLeads, needsReview, hot, booked, recent, me, attention] = await Promise.all([
    count(projects().eq("stage", "new")),
    count(projects().eq("review_status", "needs_review")),
    count(projects().eq("lead_classification", "hot")),
    count(supabase.from("appointments").select("id", { count: "exact", head: true }).eq("status", "scheduled")),
    supabase.from("projects").select(LEAD_COLUMNS).order("created_at", { ascending: false }).limit(5),
    getMe(),
    loadAttention(supabase),
  ]);

  const tiles = [
    { label: "New leads", value: newLeads, Icon: Inbox, href: "/leads" },
    { label: "Hot leads", value: hot, Icon: Flame, href: "/leads?f=hot" },
    { label: "Needs review", value: needsReview, Icon: ShieldAlert, href: "/leads?f=review" },
    { label: "Consultations booked", value: booked, Icon: CalendarCheck, href: "/leads" },
  ];

  const allClear = attention.replyTotal + attention.today.length + attention.waiting + attention.unbooked === 0;

  return (
    <div>
      <PageHeader eyebrow={greeting(me?.display_name ?? "there")} title="Command Overview" />

      <div className="mb-8 grid grid-cols-2 gap-3 sm:gap-5 xl:grid-cols-4">
        {tiles.map(({ label, value, Icon, href }) => (
          <Link key={label} href={href}>
            <Card className="p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-bronze hover:shadow-md sm:p-6">
              <div className="flex items-start justify-between">
                <p className="eyebrow">{label}</p>
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-cream text-bronze">
                  <Icon size={17} strokeWidth={1.6} />
                </span>
              </div>
              <p className="mt-4 font-serif text-4xl leading-none sm:mt-6 sm:text-5xl">{value}</p>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="min-w-0 lg:col-span-2">
          <div className="mb-3 flex items-end justify-between">
            <div>
              <p className="eyebrow">Latest</p>
              <h2 className="font-serif text-2xl">Recent leads</h2>
            </div>
            <Link href="/leads" className="text-sm text-bronze hover:text-walnut">
              View all
            </Link>
          </div>
          <LeadsTable leads={(recent.data ?? []) as LeadRow[]} />
        </section>

        <aside className="min-w-0">
          <div className="mb-3">
            <p className="eyebrow">Today</p>
            <h2 className="font-serif text-2xl">Needs your attention</h2>
          </div>
          <Card className="divide-y divide-line">
            {allClear && <p className="p-5 text-sm text-muted">You&apos;re all caught up. Nothing is waiting on you.</p>}

            {attention.replyTotal > 0 && (
              <div className="p-4">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-medium">Emails to reply to</p>
                  <Link href="/inbox" className="text-xs text-bronze hover:text-walnut">
                    All {attention.replyTotal}
                  </Link>
                </div>
                <ul className="space-y-1">
                  {attention.replies.map((r) => (
                    <li key={r.id}>
                      <Link href={`/inbox/${r.id}`} className="-mx-2 flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-cream">
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{r.who}</span>
                          <span className="block truncate text-xs text-muted">{r.subject || "(no subject)"}</span>
                        </span>
                        {r.priority && r.priority !== "normal" && r.priority !== "low" && <Pill kind={priorityPill[r.priority]}>{r.priority}</Pill>}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {attention.today.length > 0 && (
              <div className="p-4">
                <p className="mb-2 text-sm font-medium">Consultations today</p>
                <ul className="space-y-1">
                  {attention.today.map((t) => (
                    <li key={t.projectId + t.time}>
                      <Link href={`/leads/${t.projectId}`} className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-cream">
                        <span className="w-16 shrink-0 font-serif text-lg leading-none">{t.time}</span>
                        <span className="truncate">{t.name}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {(attention.waiting > 0 || attention.unbooked > 0) && (
              <div className="p-4">
                <p className="mb-2 text-sm font-medium">Follow-ups</p>
                <ul className="space-y-1 text-sm">
                  {attention.waiting > 0 && (
                    <li>
                      <Link href="/inbox?f=waiting" className="-mx-2 block rounded-lg px-2 py-1.5 transition-colors hover:bg-cream">
                        <b>{attention.waiting}</b> customer{attention.waiting === 1 ? " hasn't" : "s haven't"} replied
                      </Link>
                    </li>
                  )}
                  {attention.unbooked > 0 && (
                    <li>
                      <Link href="/leads?f=nobooking" className="-mx-2 block rounded-lg px-2 py-1.5 transition-colors hover:bg-cream">
                        <b>{attention.unbooked}</b> estimate{attention.unbooked === 1 ? "" : "s"} with no booking yet
                      </Link>
                    </li>
                  )}
                </ul>
              </div>
            )}
          </Card>
        </aside>
      </div>
    </div>
  );
}
