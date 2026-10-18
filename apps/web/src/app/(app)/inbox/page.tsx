import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, PageHeader, Pill } from "../ui";

const filters = [
  { key: "reply", label: "Needs reply" },
  { key: "open", label: "All open" },
  { key: "handled", label: "Handled" },
];

const priorityPill: Record<string, string> = { urgent: "hot", high: "warm", normal: "cold", low: "cold" };
const pretty = (s: string) => s.replaceAll("_", " ");

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
};

export default async function InboxPage({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const { f = "reply" } = await searchParams;
  const supabase = await createClient();

  let q = supabase
    .from("inbox_emails")
    .select(
      "id, from_address, from_name, subject, body_text, received_at, analysis_status, category, priority, needs_reply, summary, contact_id, project_id",
    )
    .order("received_at", { ascending: false })
    .limit(100);
  if (f === "handled") q = q.in("status", ["handled", "archived"]);
  else q = q.eq("status", "open");
  if (f === "reply") q = q.eq("needs_reply", true);

  const { data, error } = await q;
  const rows = (data ?? []) as Row[];

  return (
    <div>
      <PageHeader eyebrow="Inbox" title="Email Assistant" />
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

      {rows.length === 0 ? (
        <Card className="px-6 py-10 text-center text-sm text-muted">
          {f === "reply" ? "Nothing needs a reply right now." : "No emails here."}
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
                <p className="mt-2 text-sm text-muted">
                  {e.summary ?? e.body_text.replace(/\s+/g, " ").slice(0, 180)}
                </p>
                <p className="mt-2 text-xs capitalize text-muted">
                  {e.category ? pretty(e.category) : e.analysis_status === "pending" ? "Analyzing…" : "Not analyzed"}
                  {e.needs_reply ? " · needs reply" : ""}
                </p>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
