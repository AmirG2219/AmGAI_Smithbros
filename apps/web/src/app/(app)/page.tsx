import { CalendarCheck, Flame, Inbox, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { LEAD_COLUMNS, LeadsTable, type LeadRow } from "./leads-table";
import { Card, PageHeader, greeting } from "./ui";

export default async function Overview() {
  const supabase = await createClient();
  const count = (q: PromiseLike<{ count: number | null }>) =>
    q.then((r) => r.count ?? 0);
  const projects = () =>
    supabase.from("projects").select("id", { count: "exact", head: true });

  const [newLeads, needsReview, hot, booked, recent, me] = await Promise.all([
    count(projects().eq("stage", "new")),
    count(projects().eq("review_status", "needs_review")),
    count(projects().eq("lead_classification", "hot")),
    count(
      supabase
        .from("appointments")
        .select("id", { count: "exact", head: true })
        .eq("status", "scheduled"),
    ),
    supabase
      .from("projects")
      .select(LEAD_COLUMNS)
      .order("created_at", { ascending: false })
      .limit(5),
    supabase.from("app_users").select("display_name").maybeSingle(),
  ]);

  const tiles = [
    { label: "New leads", value: newLeads, Icon: Inbox },
    { label: "Hot leads", value: hot, Icon: Flame },
    { label: "Needs review", value: needsReview, Icon: ShieldAlert },
    { label: "Consultations booked", value: booked, Icon: CalendarCheck },
  ];

  return (
    <div>
      <PageHeader
        eyebrow={greeting(me.data?.display_name ?? "there")}
        title="Command Overview"
      />
      <div className="mb-8 grid grid-cols-2 gap-5 xl:grid-cols-4">
        {tiles.map(({ label, value, Icon }) => (
          <Card key={label} className="p-6">
            <div className="flex items-start justify-between">
              <p className="eyebrow">{label}</p>
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-cream text-bronze">
                <Icon size={17} strokeWidth={1.6} />
              </span>
            </div>
            <p className="mt-6 font-serif text-5xl leading-none">{value}</p>
          </Card>
        ))}
      </div>
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
    </div>
  );
}
