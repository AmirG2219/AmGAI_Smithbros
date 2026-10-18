import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { LEAD_COLUMNS, LeadsTable, type LeadRow } from "../leads-table";
import { PageHeader } from "../ui";

const filters = [
  { key: "all", label: "All" },
  { key: "hot", label: "Hot" },
  { key: "warm", label: "Warm" },
  { key: "cold", label: "Cold" },
  { key: "review", label: "Needs review" },
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
  else if (["hot", "warm", "cold"].includes(f))
    query = query.eq("lead_classification", f);

  const { data, error } = await query;
  const leads = (data ?? []) as LeadRow[];

  return (
    <div>
      <PageHeader eyebrow="System 1" title="Leads" />
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
