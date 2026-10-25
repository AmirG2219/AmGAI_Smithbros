import Link from "next/link";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { findUnbookedLeads } from "@/lib/assistant/waiting";
import { LEAD_COLUMNS, LeadsTable, type LeadRow } from "../leads-table";
import { PageHeader } from "../ui";
import { Pager, pageOf, rangeOf } from "../pager";

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
  searchParams: Promise<{ f?: string; q?: string; p?: string }>;
}) {
  const sp = await searchParams;
  const f = filters.some((x) => x.key === sp.f) ? (sp.f as string) : "all";
  const page = pageOf(sp.p);
  const term = (sp.q ?? "").replace(/[%,()*\\]/g, " ").trim().slice(0, 60);
  const supabase = await createClient();

  // Name, email or phone search: find the matching clients first, then their leads.
  let contactIds: string[] | null = null;
  if (term) {
    const { data: cs } = await supabase
      .from("contacts")
      .select("id")
      .or(`first_name.ilike.%${term}%,last_name.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%`)
      .limit(300);
    contactIds = (cs ?? []).map((c) => c.id);
  }

  let query = supabase.from("projects").select(LEAD_COLUMNS, { count: "exact" });
  if (contactIds) query = query.in("contact_id", contactIds.length ? contactIds : ["00000000-0000-0000-0000-000000000000"]);
  if (f === "review") query = query.eq("review_status", "needs_review");
  else if (f === "nobooking") {
    // Estimate emailed 3 or more days ago and no consultation yet.
    const ids = (await findUnbookedLeads(supabase)).map((l) => l.id);
    query = query.in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
  } else if (["hot", "warm", "cold"].includes(f)) query = query.eq("lead_classification", f);

  const [from, to] = rangeOf(page);
  const { data, error, count } = await query.order("created_at", { ascending: false }).range(from, to);
  const leads = (data ?? []) as LeadRow[];
  const href = (key: string, pg = 1) => {
    const qs = new URLSearchParams({ ...(key !== "all" ? { f: key } : {}), ...(term ? { q: term } : {}), ...(pg > 1 ? { p: String(pg) } : {}) }).toString();
    return qs ? `/leads?${qs}` : "/leads";
  };

  return (
    <div>
      <PageHeader eyebrow="Sales" title="Leads">
        <Link
          href="/leads/new"
          className="inline-flex items-center gap-2 rounded-lg bg-walnut px-4 py-2.5 text-sm font-medium text-cream transition-colors hover:bg-bronze"
        >
          <Plus size={16} /> New Lead
        </Link>
      </PageHeader>
      <div className="mb-4 flex flex-wrap gap-2">
        {filters.map((x) => (
          <Link
            key={x.key}
            href={href(x.key)}
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
      <form className="mb-4 flex flex-wrap gap-2">
        {f !== "all" && <input type="hidden" name="f" value={f} />}
        <input
          name="q"
          defaultValue={term}
          placeholder="Search name, email or phone"
          className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-bronze sm:max-w-xs"
        />
        <button className="rounded-lg border border-walnut px-4 py-2.5 text-sm font-medium hover:bg-walnut hover:text-cream">Search</button>
        {term && (
          <Link href={href(f)} className="self-center text-sm text-bronze hover:text-walnut">
            Clear
          </Link>
        )}
      </form>
      {error && <p className="mb-4 text-red-700">Could not load leads.</p>}
      <LeadsTable leads={leads} />
      <Pager page={page} total={count ?? 0} hrefFor={(pg) => href(f, pg)} />
    </div>
  );
}
