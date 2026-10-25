import Link from "next/link";
import { ChevronRight, Plus, Search } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { STATUS, TABS, fmtDate, pretty } from "@/lib/agreements/status";
import { DOC_NAME, type DocType, type Snapshot } from "@/lib/agreements/vars";
import { Card } from "../ui";
import { Pager, pageOf, rangeOf } from "../pager";

type Contact = { first_name: string; last_name: string | null; email: string | null };
type Row = {
  id: string;
  document_type: DocType;
  status: string;
  created_at: string;
  sent_at: string | null;
  rendered_data_snapshot: Snapshot;
  projects: { project_type: string | null; site_address_line1: string | null; contacts: Contact | Contact[] | null } | null;
};

const contactOf = (r: Row) => {
  const c = r.projects?.contacts;
  return (Array.isArray(c) ? c[0] : c) ?? null;
};

const COLS = "lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1.2fr)_9.5rem_6.5rem_4.5rem]";

export default async function Agreements({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; tab?: string; type?: string; p?: string }>;
}) {
  const sp = await searchParams;
  const page = pageOf(sp.p);
  const supabase = await createClient();
  const tab = TABS.find((t) => t.key === sp.tab) ?? TABS[0];
  const type = sp.type === "work_contract" || sp.type === "policy_liability" ? sp.type : "";
  const term = (sp.q ?? "").replace(/[%,()*\\]/g, " ").trim().slice(0, 60);

  // Search by customer name or email, or by site address: find matching projects first.
  let projectIds: string[] | null = null;
  if (term) {
    const [{ data: cs }, { data: byAddress }] = await Promise.all([
      supabase.from("contacts").select("id").or(`first_name.ilike.%${term}%,last_name.ilike.%${term}%,email.ilike.%${term}%`).limit(200),
      supabase.from("projects").select("id").or(`site_address_line1.ilike.%${term}%,site_city.ilike.%${term}%`).limit(200),
    ]);
    const ids = (cs ?? []).map((c) => c.id);
    const { data: byContact } = ids.length ? await supabase.from("projects").select("id").in("contact_id", ids).limit(500) : { data: [] };
    projectIds = [...new Set([...(byContact ?? []), ...(byAddress ?? [])].map((p) => p.id))];
  }

  let query = supabase
    .from("agreements")
    .select(
      "id, document_type, status, created_at, sent_at, rendered_data_snapshot, projects(project_type, site_address_line1, contacts(first_name, last_name, email))",
      { count: "exact" },
    )
    .in("status", [...tab.statuses]);
  if (type) query = query.eq("document_type", type);
  if (projectIds) query = query.in("project_id", projectIds);
  const [from, to] = rangeOf(page);

  const [{ data, count }, { data: all }] = await Promise.all([
    query.order("created_at", { ascending: false }).range(from, to),
    supabase.from("agreements").select("status"),
  ]);
  const rows = (data ?? []) as unknown as Row[];
  const n = (...s: string[]) => (all ?? []).filter((a) => s.includes(a.status)).length;
  // Each card is the count of the tab with the same name, so the numbers always agree.
  const stat = (key: string) => n(...(TABS.find((t) => t.key === key)?.statuses ?? []));
  const cards = [
    { label: "Total Agreements", key: "all", note: "excluding archived" },
    { label: "Awaiting Return", key: "awaiting", note: "sent to customer" },
    { label: "Verified", key: "verified", note: "signed and checked" },
    { label: "Drafts", key: "drafts", note: "incl. ready to send" },
  ];

  const href = (o: Record<string, string | undefined>) => {
    const qs = new URLSearchParams(Object.entries({ q: term, tab: tab.key === "all" ? "" : tab.key, type, ...o }).filter(([, v]) => v) as [string, string][]).toString();
    return qs ? `/agreements?${qs}` : "/agreements";
  };

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Paperwork</p>
          <h1 className="mt-1 font-serif text-3xl sm:text-4xl">Agreements &amp; Contracts</h1>
          <p className="mt-1 text-sm text-muted">Create, send and track customer agreements and work contracts.</p>
        </div>
        <Link href="/agreements/new" className="inline-flex items-center gap-2 rounded-lg bg-walnut px-4 py-2.5 text-sm font-medium text-cream hover:bg-bronze">
          <Plus size={16} /> Create Agreement
        </Link>
      </header>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {cards.map(({ label, key, note }) => (
          <Link key={label} href={href({ tab: key === "all" ? "" : key, p: "" })} className="rounded-xl border border-line bg-card px-4 py-3 transition-colors hover:border-bronze">
            <p className="font-serif text-2xl leading-none">{stat(key)}</p>
            <p className="mt-1.5 text-sm">{label}</p>
            <p className="text-xs text-muted">{note}</p>
          </Link>
        ))}
      </div>

      <Card className="min-w-0 overflow-hidden">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line px-3 pt-1 sm:px-4">
          <nav className="-mb-px flex min-w-0 flex-1 gap-0.5 overflow-x-auto text-sm [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {TABS.map((t) => (
              <Link
                key={t.key}
                href={href({ tab: t.key === "all" ? "" : t.key, p: "" })}
                className={`whitespace-nowrap border-b-2 px-3 py-3 ${tab.key === t.key ? "border-bronze font-medium text-walnut" : "border-transparent text-muted hover:text-walnut"}`}
              >
                {t.label} <span className="text-xs text-muted">{n(...t.statuses)}</span>
              </Link>
            ))}
          </nav>
          <form className="flex w-full items-center gap-2 pb-3 sm:w-auto sm:py-2">
            {tab.key !== "all" && <input type="hidden" name="tab" value={tab.key} />}
            <div className="relative min-w-0 flex-1 sm:w-60 sm:flex-none">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input name="q" defaultValue={term} placeholder="Search customer or address" aria-label="Search" className="w-full rounded-lg border border-line bg-white py-2 pl-8 pr-3 text-sm outline-none focus:border-bronze" />
            </div>
            <select name="type" defaultValue={type} aria-label="Document type" className="rounded-lg border border-line bg-white px-2.5 py-2 text-sm outline-none focus:border-bronze">
              <option value="">All types</option>
              <option value="work_contract">Contracts</option>
              <option value="policy_liability">Policies</option>
            </select>
            <button className="rounded-lg border border-walnut px-3 py-2 text-sm font-medium hover:bg-walnut hover:text-cream">Go</button>
            {(term || type) && (
              <Link href={href({ q: "", type: "" })} className="text-sm text-bronze hover:text-walnut">Clear</Link>
            )}
          </form>
        </div>

        <div className={`hidden gap-3 border-b border-line bg-cream/50 px-5 py-2 text-[10px] font-medium uppercase tracking-[0.18em] text-muted lg:grid ${COLS}`}>
          <span>Customer</span><span>Project</span><span>Document</span><span>Status</span><span>Date</span><span className="text-right">&nbsp;</span>
        </div>

        {rows.length === 0 ? (
          <p className="px-6 py-14 text-center text-sm text-muted">
            {term || type || tab.key !== "all" ? "No agreements match." : "No agreements yet. Use Create Agreement to make the first one."}
          </p>
        ) : (
          <ul>
            {rows.map((r) => {
              const c = contactOf(r);
              const st = STATUS[r.status];
              const rev = r.rendered_data_snapshot._revision ?? 1;
              return (
                <li key={r.id} className="border-b border-line last:border-0">
                  <Link href={`/agreements/${r.id}`} className={`group grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 px-4 py-3 hover:bg-cream/70 sm:px-5 ${COLS}`}>
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{c?.first_name} {c?.last_name}</span>
                      <span className="block truncate text-xs text-muted">{r.projects?.site_address_line1 ?? c?.email ?? ""}</span>
                    </span>
                    <span className="justify-self-end lg:order-4 lg:justify-self-start">
                      <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${st?.tone}`}>{st?.label}</span>
                    </span>
                    <span className="hidden truncate text-sm lg:order-2 lg:block">{pretty(r.projects?.project_type)}</span>
                    <span className="col-span-2 text-sm lg:order-3 lg:col-span-1 lg:truncate">
                      {DOC_NAME[r.document_type]}
                      {rev > 1 && <span className="text-muted"> · rev {rev}</span>}
                      <span className="text-xs text-muted lg:hidden"> · {pretty(r.projects?.project_type)} · {fmtDate(r.sent_at ?? r.created_at)}</span>
                    </span>
                    <span className="hidden text-sm text-muted lg:order-5 lg:block">{fmtDate(r.sent_at ?? r.created_at)}</span>
                    <span className="hidden items-center justify-end gap-0.5 text-sm text-bronze group-hover:text-walnut lg:order-6 lg:flex">
                      View <ChevronRight size={14} />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
        <div className="px-5">
          <Pager page={page} total={count ?? 0} hrefFor={(pg) => href({ p: pg > 1 ? String(pg) : "" })} />
        </div>
      </Card>
    </div>
  );
}
