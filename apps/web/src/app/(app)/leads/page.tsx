import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { findUnbookedLeads } from "@/lib/assistant/waiting";
import { LEAD_COLUMNS, LeadsTable, type LeadRow } from "../leads-table";
import { PageHeader } from "../ui";

const filters = [
  { key: "all", label: "All" },
  { key: "hot", label: "Hot" },
  { key: "warm", label: "Warm" },
  { key: "cold", label: "Cold" },
  { key: "review", label: "Needs review" },
  { key: "nobooking", label: "No booking yet" },
];

export default async function Leads({
  searchParams,
}: {
  searchParams: Promise<{ f?: string }>;
}) {
  const { f = "all" } = await searchParams;
  const supabase = await createClient();

  let query = supabase
    .from("projects")
    .select(LEAD_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(100);
  if (f === "review") query = query.eq("review_status", "needs_review");
  else if (f === "nobooking") {
    // Estimate emailed 3 or more days ago and no consultation yet.
    const ids = (await findUnbookedLeads(supabase)).map((l) => l.id);
    query = query.in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
  }
  else if (["hot", "warm", "cold"].includes(f))
    query = query.eq("lead_classification", f);

  const { data, error } = await query;
  const leads = (data ?? []) as LeadRow[];

  return (
    <div>
      <PageHeader eyebrow="Sales" title="Leads" />
      <div className="mb-4 flex flex-wrap gap-2">
        {filters.map((x) => (
          <Link
            key={x.key}
            href={x.key === "all" ? "/leads" : `/leads?f=${x.key}`}
            className={`rounded-full border px-4 py-1.5 text-sm ${
              f === x.key
                ? "border-walnut bg-walnut text-cream"
                : "border-line bg-card text-muted hover:text-walnut"
            }`}
          >
            {x.label}
          </Link>
        ))}
      </div>
      {error && <p className="mb-4 text-red-700">Could not load leads.</p>}
      <LeadsTable leads={leads} />
    </div>
  );
}
