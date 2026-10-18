import Link from "next/link";
import { Plus } from "lucide-react";
import { SOURCE_LABELS, sourceLabel } from "@/lib/contacts/sources";
import { createClient } from "@/lib/supabase/server";
import { Card, PageHeader, Pill, td, th } from "../ui";

const date = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" });

export default async function Clients({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; q?: string; source?: string }>;
}) {
  const { notice, q, source } = await searchParams;
  const supabase = await createClient();

  const term = (q ?? "").replace(/[%,()*\\]/g, " ").trim().slice(0, 60);
  const sourceFilter = source && /^[a-z_]{1,30}$/.test(source) ? source : "";

  let query = supabase
    .from("contacts")
    .select("id, first_name, last_name, email, phone, source, created_at, projects(id)", { count: "exact" });
  if (sourceFilter) query = query.eq("source", sourceFilter);
  if (term)
    query = query.or(`first_name.ilike.%${term}%,last_name.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%`);
  const { data: contacts, count, error } = await query.order("created_at", { ascending: false }).limit(200);
  const rows = contacts ?? [];

  // Offer the sources that actually exist, so the filter never lists an empty choice.
  const { data: used } = await supabase.from("contacts").select("source").limit(2000);
  const sources = [...new Set((used ?? []).map((r) => r.source).filter(Boolean))] as string[];
  const filtered = !!(term || sourceFilter);

  return (
    <div>
      <PageHeader eyebrow="Reference" title="Clients">
        <Link
          href="/contacts/new"
          className="inline-flex items-center gap-2 rounded-lg bg-walnut px-4 py-2.5 text-sm font-medium text-cream hover:bg-bronze"
        >
          <Plus size={16} /> Add client
        </Link>
      </PageHeader>
      {notice === "added" && (
        <p className="mb-5 rounded-xl border border-gold/40 bg-gold/10 px-4 py-3 text-sm">Client added.</p>
      )}
      {error && <p className="mb-4 text-red-700">Could not load clients.</p>}

      <form className="mb-5 flex flex-wrap gap-2">
        <input
          name="q"
          defaultValue={term}
          placeholder="Search name, email or phone"
          className="min-w-0 flex-1 rounded-lg border border-line bg-white px-3 py-2.5 text-sm outline-none focus:border-bronze sm:max-w-xs"
        />
        <select name="source" defaultValue={sourceFilter} className="rounded-lg border border-line bg-white px-3 py-2.5 text-sm outline-none focus:border-bronze">
          <option value="">All sources</option>
          {sources.map((s) => (
            <option key={s} value={s}>
              {SOURCE_LABELS[s] ?? sourceLabel(s)}
            </option>
          ))}
        </select>
        <button className="rounded-lg border border-walnut px-4 py-2.5 text-sm font-medium hover:bg-walnut hover:text-cream">Search</button>
        {filtered && (
          <Link href="/contacts" className="self-center text-sm text-bronze hover:text-walnut">
            Clear
          </Link>
        )}
      </form>
      <p className="mb-3 text-sm text-muted">
        {count ?? rows.length} client{(count ?? rows.length) === 1 ? "" : "s"}
        {filtered ? " match" : ""}
        {(count ?? 0) > rows.length && `, showing the latest ${rows.length}`}
      </p>

      <div className="flex flex-col gap-3 md:hidden">
        {rows.map((c) => (
          <Card key={c.id} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <p className="font-medium">
                {c.first_name} {c.last_name}
              </p>
              <Pill kind="review">{sourceLabel(c.source)}</Pill>
            </div>
            <p className="text-sm text-muted">{c.email ?? "—"}</p>
            <p className="text-sm text-muted">{c.phone ?? "—"}</p>
            <p className="mt-1 text-xs text-muted">Added {date(c.created_at)}</p>
          </Card>
        ))}
        {rows.length === 0 && (
          <Card className="px-6 py-10 text-center text-sm text-muted">{filtered ? "No clients match." : "No clients yet."}</Card>
        )}
      </div>

      <Card className="hidden overflow-x-auto md:block">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line">
            <tr>
              <th className={th}>Name</th>
              <th className={th}>Email</th>
              <th className={th}>Phone</th>
              <th className={th}>Came from</th>
              <th className={th}>Jobs</th>
              <th className={th}>Added</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id} className="border-b border-line last:border-0">
                <td className={`${td} font-medium`}>
                  {c.first_name} {c.last_name}
                </td>
                <td className={`${td} text-muted`}>{c.email ?? "—"}</td>
                <td className={`${td} text-muted`}>{c.phone ?? "—"}</td>
                <td className={td}>
                  <Pill kind="review">{sourceLabel(c.source)}</Pill>
                </td>
                <td className={`${td} text-muted`}>{c.projects?.length ?? 0}</td>
                <td className={`${td} text-muted`}>{date(c.created_at)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-6 py-10 text-center text-muted">
                  {filtered ? "No clients match." : "No clients yet."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
