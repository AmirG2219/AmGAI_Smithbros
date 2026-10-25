import Link from "next/link";
import { ArrowLeft, Check, Search } from "lucide-react";
import { SOURCE_LABELS } from "@/lib/contacts/sources";
import { LABELS, PROJECT_TYPES, TIMELINES } from "@/lib/leads/inquiry";
import { LEAD_SOURCES } from "@/lib/leads/manual";
import { createClient } from "@/lib/supabase/server";
import { Card } from "../../ui";
import { NewLeadForm } from "./form";

const input = "w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-bronze";
const UUID = /^[0-9a-f-]{36}$/i;

type Customer = { id: string; first_name: string; last_name: string | null; email: string | null; phone: string | null };
const nameOf = (c: Pick<Customer, "first_name" | "last_name">) => [c.first_name, c.last_name].filter(Boolean).join(" ");
const detailOf = (c: Customer) => [c.email, c.phone].filter(Boolean).join(" · ");

export default async function NewLead({ searchParams }: { searchParams: Promise<{ customer?: string; q?: string }> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const term = (sp.q ?? "").replace(/[%,()*\\]/g, " ").trim().slice(0, 60);

  const customer =
    sp.customer && UUID.test(sp.customer)
      ? ((await supabase.from("contacts").select("id, first_name, last_name, email, phone").eq("id", sp.customer).maybeSingle()).data as Customer | null)
      : null;

  // Existing customers to pick from: matches for the search, or the most recent few.
  let found: Customer[] = [];
  if (!customer) {
    let q = supabase.from("contacts").select("id, first_name, last_name, email, phone").order("created_at", { ascending: false }).limit(8);
    if (term) q = q.or(`first_name.ilike.%${term}%,last_name.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%`);
    found = ((await q).data ?? []) as Customer[];
  }

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/leads" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-walnut">
        <ArrowLeft size={14} /> All leads
      </Link>
      <header className="mb-5">
        <p className="eyebrow">Sales</p>
        <h1 className="mt-1 font-serif text-3xl sm:text-4xl">New lead</h1>
        <p className="mt-1 text-sm text-muted">Add an inquiry from a phone call, walk-in, email or referral. Fill in what you know; the rest can wait.</p>
      </header>

      <div className="grid gap-4">
        <Card className="p-4 sm:p-5">
          <p className="eyebrow mb-3">Customer</p>
          {customer ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm">
                <Check size={14} className="mr-1.5 inline text-bronze" />
                <strong>{nameOf(customer)}</strong>
                <span className="text-muted">{detailOf(customer) ? ` · ${detailOf(customer)}` : ""}</span>
              </p>
              <Link href="/leads/new" className="text-sm text-bronze hover:text-walnut">Change</Link>
            </div>
          ) : (
            <div className="grid gap-3">
              <p className="text-sm text-muted">Already a customer? Find them here. Otherwise enter their details below.</p>
              <form className="flex gap-2">
                <div className="relative min-w-0 flex-1">
                  <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                  <input name="q" defaultValue={term} placeholder="Search by name, email or phone" aria-label="Search customers" className={`${input} pl-8`} />
                </div>
                <button className="rounded-lg border border-walnut px-4 py-2 text-sm font-medium hover:bg-walnut hover:text-cream">Search</button>
              </form>
              {term && found.length === 0 && <p className="text-sm text-muted">No customer matches. Enter their details below.</p>}
              {found.length > 0 && (
                <ul className="overflow-hidden rounded-xl border border-line bg-surface">
                  <li className="border-b border-line bg-cream/50 px-3.5 py-1.5 text-[10px] font-medium uppercase tracking-[0.18em] text-muted">{term ? "Matches" : "Recent customers"}</li>
                  {found.map((c) => (
                    <li key={c.id} className="border-b border-line last:border-0">
                      <Link href={`/leads/new?customer=${c.id}`} className="flex flex-wrap items-baseline justify-between gap-x-3 px-3.5 py-2.5 text-sm hover:bg-cream/70">
                        <span className="font-medium">{nameOf(c)}</span>
                        <span className="truncate text-xs text-muted">{detailOf(c)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </Card>

        <Card className="p-4 sm:p-5">
          <p className="eyebrow mb-3">{customer ? "Lead details" : "New customer and lead details"}</p>
          <NewLeadForm
            key={customer?.id ?? "new"}
            customerId={customer?.id ?? null}
            sources={LEAD_SOURCES.map((s) => [s, SOURCE_LABELS[s]])}
            projectTypes={PROJECT_TYPES.map((s) => [s, LABELS[s]])}
            timelines={TIMELINES.map((s) => [s, LABELS[s]])}
          />
        </Card>
      </div>
    </div>
  );
}
