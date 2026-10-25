import Link from "next/link";
import { ArrowLeft, Check, FileText, FileSignature, Files, Plus, Search, TriangleAlert } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadContext, preflight } from "@/lib/agreements/build";
import { pretty } from "@/lib/agreements/status";
import { EMPTY_INPUTS, PROJECT_TYPE_CHOICES, type DocType } from "@/lib/agreements/vars";
import { Card } from "../../ui";
import { createDraftsAction, createProjectAction } from "../actions";
import { AddCustomer } from "../add-customer";
import { Submit, input, labelCls } from "../client";
import { DraftFields } from "../draft-fields";

const CHOICES = [
  { key: "policy", label: "Policy / Liability Agreement", blurb: "The terms a customer accepts before work begins.", Icon: FileText, types: ["policy_liability"] },
  { key: "contract", label: "Work Contract", blurb: "Scope, price and schedule from the accepted final quote.", Icon: FileSignature, types: ["work_contract"] },
  { key: "both", label: "Both", blurb: "Create both and send them together in one email.", Icon: Files, types: ["policy_liability", "work_contract"] },
] as const;

const UUID = /^[0-9a-f-]{36}$/i;
const uuid = (s?: string) => (s && UUID.test(s) ? s : "");
const btnOutline = "w-fit rounded-lg border border-walnut px-5 py-2.5 text-sm font-medium hover:bg-walnut hover:text-cream";

type Customer = { id: string; first_name: string; last_name: string | null; email: string | null; phone: string | null };
const nameOf = (c: Pick<Customer, "first_name" | "last_name">) => [c.first_name, c.last_name].filter(Boolean).join(" ");

function Field({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <div>
      <label className={labelCls} htmlFor={id}>{title}</label>
      {children}
    </div>
  );
}

export default async function NewAgreement({
  searchParams,
}: {
  searchParams: Promise<{ customer?: string; client?: string; project?: string; docs?: string; q?: string; error?: string; notice?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();
  const choice = CHOICES.find((c) => c.key === sp.docs);
  const term = (sp.q ?? "").replace(/[%,()*\\]/g, " ").trim().slice(0, 60);

  // A project (from a lead page or earlier step) decides the customer; otherwise use the chosen customer.
  const projectParam = uuid(sp.project);
  const proj = projectParam
    ? (await supabase.from("projects").select("id, contact_id, project_type, site_address_line1, site_city").eq("id", projectParam).maybeSingle()).data
    : null;
  const customerId = proj?.contact_id ?? uuid(sp.customer) ?? uuid(sp.client);
  const customer = customerId
    ? ((await supabase.from("contacts").select("id, first_name, last_name, email, phone").eq("id", customerId).maybeSingle()).data as Customer | null)
    : null;

  // Step 1 data: matching customers (or the most recent ones)
  let found: Customer[] = [];
  if (!customer) {
    let q = supabase.from("contacts").select("id, first_name, last_name, email, phone").order("created_at", { ascending: false }).limit(8);
    if (term) q = q.or(`first_name.ilike.%${term}%,last_name.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%`);
    found = ((await q).data ?? []) as Customer[];
  }

  // Step 2 data: this customer's projects
  const projects = customer
    ? ((await supabase.from("projects").select("id, project_type, site_address_line1, site_city, stage").eq("contact_id", customer.id).order("created_at", { ascending: false })).data ?? [])
    : [];

  const ready = !!(customer && proj && choice);

  // Step 4 data, read with the full-access client (templates and storage are server-only).
  const db = createAdminClient();
  const types = (choice?.types ?? []) as unknown as DocType[];
  const blockers = ready ? await preflight(db, proj.id, types, { allowNewQuote: true }) : [];
  const ctx = ready ? await loadContext(db, proj.id) : null;
  const needsQuote = !!ctx && types.includes("work_contract") && !ctx.quote;

  const step = (n: number, label: string) => `Step ${n} · ${label}`;

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/agreements" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-walnut">
        <ArrowLeft size={14} /> Agreements
      </Link>
      <header className="mb-5">
        <p className="eyebrow">Agreements</p>
        <h1 className="mt-1 font-serif text-3xl sm:text-4xl">Create agreement</h1>
        <p className="mt-1 text-sm text-muted">Pick or add the customer and project, choose the document, then review the details. You&apos;ll preview the PDF before anything is generated or sent.</p>
      </header>

      {sp.error && <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{sp.error}</p>}
      {sp.notice === "existing" && (
        <p className="mb-4 rounded-xl border border-gold/40 bg-gold/10 px-4 py-3 text-sm">That customer was already on file, so the existing record was selected and no duplicate was created.</p>
      )}

      <div className="grid gap-4">
        {/* Step 1: customer */}
        <Card className="p-4 sm:p-5">
          <p className="eyebrow mb-3">{step(1, "Customer")}</p>
          {customer ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm">
                <Check size={14} className="mr-1.5 inline text-bronze" />
                <strong>{nameOf(customer)}</strong>
                <span className="text-muted">{[customer.email, customer.phone].filter(Boolean).map((x) => ` · ${x}`).join("")}</span>
              </p>
              <Link href="/agreements/new" className="text-sm text-bronze hover:text-walnut">Change</Link>
            </div>
          ) : (
            <div className="grid gap-3">
              <form className="flex gap-2">
                <div className="relative min-w-0 flex-1">
                  <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                  <input name="q" defaultValue={term} placeholder="Search by name, email or phone" aria-label="Search customers" className={`${input} pl-8`} />
                </div>
                <button className="rounded-lg border border-walnut px-4 py-2 text-sm font-medium hover:bg-walnut hover:text-cream">Search</button>
              </form>
              {found.length === 0 ? (
                <p className="text-sm text-muted">{term ? "No customer matches. Add them below." : "No customers yet. Add the first one below."}</p>
              ) : (
                <ul className="overflow-hidden rounded-xl border border-line bg-white">
                  <li className="border-b border-line bg-cream/50 px-3.5 py-1.5 text-[10px] font-medium uppercase tracking-[0.18em] text-muted">{term ? "Matches" : "Recent customers"}</li>
                  {found.map((c) => (
                    <li key={c.id} className="border-b border-line last:border-0">
                      <Link href={`/agreements/new?customer=${c.id}`} className="flex flex-wrap items-baseline justify-between gap-x-3 px-3.5 py-2.5 text-sm hover:bg-cream/70">
                        <span className="font-medium">{nameOf(c)}</span>
                        <span className="truncate text-xs text-muted">{[c.email, c.phone].filter(Boolean).join(" · ")}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              <details className="group rounded-xl border border-dashed border-line p-3.5 open:bg-white" open={!!sp.error && !customer}>
                <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium text-bronze [&::-webkit-details-marker]:hidden">
                  <Plus size={15} /> Add a new customer
                </summary>
                <AddCustomer />
              </details>
            </div>
          )}
        </Card>

        {/* Step 2: project */}
        {customer && (
          <Card className="p-4 sm:p-5">
            <p className="eyebrow mb-3">{step(2, "Project")}</p>
            {proj ? (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm">
                  <Check size={14} className="mr-1.5 inline text-bronze" />
                  <strong>{pretty(proj.project_type)}</strong>
                  <span className="text-muted">{[proj.site_address_line1, proj.site_city].filter(Boolean).map((x) => ` · ${x}`).join("")}</span>
                </p>
                <Link href={`/agreements/new?customer=${customer.id}`} className="text-sm text-bronze hover:text-walnut">Change</Link>
              </div>
            ) : (
              <div className="grid gap-3">
                {projects.length > 0 && (
                  <ul className="overflow-hidden rounded-xl border border-line bg-white">
                    {projects.map((p) => (
                      <li key={p.id} className="border-b border-line last:border-0">
                        <Link href={`/agreements/new?customer=${customer.id}&project=${p.id}${choice ? `&docs=${choice.key}` : ""}`} className="flex flex-wrap items-baseline justify-between gap-x-3 px-3.5 py-2.5 text-sm hover:bg-cream/70">
                          <span className="font-medium">{pretty(p.project_type)}</span>
                          <span className="truncate text-xs text-muted">{[p.site_address_line1, p.site_city].filter(Boolean).join(", ") || "No address yet"} · {pretty(p.stage)}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
                <details className="rounded-xl border border-dashed border-line p-3.5 open:bg-white" open={projects.length === 0 || !!sp.error}>
                  <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium text-bronze [&::-webkit-details-marker]:hidden">
                    <Plus size={15} /> {projects.length ? "Create a new project" : "Create the customer's first project"}
                  </summary>
                  <form action={createProjectAction.bind(null, customer.id)} className="mt-3 grid gap-3 sm:grid-cols-2">
                    <Field id="project_type" title="Project type">
                      <select id="project_type" name="project_type" required defaultValue="" className={input}>
                        <option value="" disabled>Choose…</option>
                        {PROJECT_TYPE_CHOICES.map((t) => <option key={t} value={t}>{pretty(t)}</option>)}
                      </select>
                    </Field>
                    <Field id="site_address_line1" title="Job site street address"><input id="site_address_line1" name="site_address_line1" required className={input} /></Field>
                    <Field id="site_city" title="City"><input id="site_city" name="site_city" className={input} /></Field>
                    <Field id="site_postal_code" title="Postal code"><input id="site_postal_code" name="site_postal_code" className={input} /></Field>
                    <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
                      <Submit pending="Creating…">Create project and continue</Submit>
                      <span className="text-xs text-muted">No website inquiry needed. The scope and price are entered with the contract.</span>
                    </div>
                  </form>
                </details>
              </div>
            )}
          </Card>
        )}

        {/* Step 3: document */}
        {customer && proj && (
          <form className="grid gap-4">
            <input type="hidden" name="customer" value={customer.id} />
            <input type="hidden" name="project" value={proj.id} />
            <Card className="p-4 sm:p-5">
              <p className="eyebrow mb-3">{step(3, "Document")}</p>
              <div className="grid gap-2.5 sm:grid-cols-3">
                {CHOICES.map(({ key, label, blurb, Icon }) => (
                  <label key={key} className="relative flex cursor-pointer flex-col gap-1 rounded-xl border border-line bg-white p-3.5 transition-colors has-[:checked]:border-bronze has-[:checked]:bg-bronze/10 hover:border-bronze">
                    <input type="radio" name="docs" value={key} required defaultChecked={sp.docs === key} className="sr-only" />
                    <Icon size={20} strokeWidth={1.5} className="text-bronze" />
                    <span className="text-sm font-medium">{label}</span>
                    <span className="text-xs text-muted">{blurb}</span>
                  </label>
                ))}
              </div>
            </Card>
            <button className={btnOutline}>{ready ? "Update selection" : "Continue"}</button>
          </form>
        )}

        {/* Step 4: review and create */}
        {ready && ctx && proj && customer && (
          <>
            {blockers.length > 0 ? (
              <Card className="border-amber-300 bg-amber-50 p-5">
                <p className="mb-2 flex items-center gap-2 font-medium text-amber-900">
                  <TriangleAlert size={18} /> This document can&apos;t be created yet
                </p>
                <ul className="list-disc space-y-1.5 pl-5 text-sm text-amber-900">
                  {blockers.map((b) => (
                    <li key={b.text}>
                      {b.text}{" "}
                      {b.href && <Link href={b.href} className="underline">Open</Link>}
                    </li>
                  ))}
                </ul>
              </Card>
            ) : (
              <form action={createDraftsAction} className="grid gap-4">
                <input type="hidden" name="customer" value={customer.id} />
                <input type="hidden" name="project" value={proj.id} />
                <input type="hidden" name="docs" value={sp.docs} />
                <p className="eyebrow mt-1">{step(4, "Review and complete")}</p>
                <DraftFields types={types} clientName={ctx.clientName} quote={ctx.quote} quoteEntry={needsQuote} values={{ ...EMPTY_INPUTS, ...ctx.defaults }} />
                <div className="flex flex-wrap items-center gap-3">
                  <Submit pending="Saving…">Save draft and preview</Submit>
                  <span className="text-xs text-muted">You&apos;ll see the PDF before anything is generated or sent.</span>
                </div>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  );
}
