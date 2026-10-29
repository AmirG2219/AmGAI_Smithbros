import Link from "next/link";
import { ArrowLeft, Check, FileText, FileSignature, Files, TriangleAlert } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadContext, preflight } from "@/lib/agreements/build";
import { pretty } from "@/lib/agreements/status";
import { EMPTY_INPUTS, type DocType } from "@/lib/agreements/vars";
import { Card } from "../../ui";
import { AgreementReview } from "../agreement-review";
import { CustomerStep } from "../customer-picker";
import { ProjectStep, type ProjectRow } from "../project-picker";
import { DraftFields } from "../draft-fields";

// Display order and wording only; the keys and document types are what createDraftsAction maps (policy / contract / both).
const CHOICES = [
  { key: "contract", label: "Work Contract", blurb: "Scope, price and schedule from the agreed final quote.", next: "Next: confirm the agreed price, scope and contract terms.", Icon: FileSignature, types: ["work_contract"] },
  { key: "policy", label: "Policy / Liability Agreement", blurb: "The terms a customer accepts before work begins.", next: "Next: confirm the job site. No price is needed.", Icon: FileText, types: ["policy_liability"] },
  { key: "both", label: "Both Documents", blurb: "Create both and send them together in one email.", next: "Next: one set of project details covers both documents.", Icon: Files, types: ["policy_liability", "work_contract"] },
] as const;

const UUID = /^[0-9a-f-]{36}$/i;
const uuid = (s?: string) => (s && UUID.test(s) ? s : "");
const btnOutline = "w-fit rounded-lg border border-walnut px-5 py-2.5 text-sm font-medium hover:bg-walnut hover:text-cream";

type Customer = { id: string; first_name: string; last_name: string | null; email: string | null; phone: string | null };
const nameOf = (c: Pick<Customer, "first_name" | "last_name">) => [c.first_name, c.last_name].filter(Boolean).join(" ");

export default async function NewAgreement({
  searchParams,
}: {
  searchParams: Promise<{ customer?: string; client?: string; project?: string; docs?: string; error?: string; notice?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();
  const choice = CHOICES.find((c) => c.key === sp.docs);

  // A project (from a lead page or earlier step) decides the customer; otherwise use the chosen customer.
  const projectParam = uuid(sp.project);
  const proj = projectParam
    ? (await supabase.from("projects").select("id, contact_id, project_type, site_address_line1, site_city, additional_answers").eq("id", projectParam).maybeSingle()).data
    : null;
  const customerId = proj?.contact_id ?? uuid(sp.customer) ?? uuid(sp.client);
  const customer = customerId
    ? ((await supabase.from("contacts").select("id, first_name, last_name, email, phone").eq("id", customerId).maybeSingle()).data as Customer | null)
    : null;

  // Step 2 data: this customer's most recent projects (the picker searches the rest on demand)
  const projectsQ = customer
    ? await supabase
        .from("projects")
        .select("id, project_type, site_address_line1, site_city, stage, additional_answers", { count: "exact" })
        .eq("contact_id", customer.id)
        .order("created_at", { ascending: false })
        .limit(6)
    : null;
  const projects: ProjectRow[] = (projectsQ?.data ?? []).map(({ additional_answers, ...p }) => ({
    ...p,
    project_name: ((additional_answers ?? {}) as { project_name?: string }).project_name ?? null,
  }));
  const projectTotal = projectsQ?.count ?? projects.length;
  const projName = ((proj?.additional_answers ?? {}) as { project_name?: string }).project_name ?? null;

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
            <CustomerStep startNew={!!sp.error} />
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
                  <strong>{projName || pretty(proj.project_type)}</strong>
                  {projName && <span className="text-muted"> · {pretty(proj.project_type)}</span>}
                  <span className="text-muted">{[proj.site_address_line1, proj.site_city].filter(Boolean).map((x) => ` · ${x}`).join("")}</span>
                </p>
                <Link href={`/agreements/new?customer=${customer.id}${choice ? `&docs=${choice.key}` : ""}`} className="text-sm text-bronze hover:text-walnut">Change</Link>
              </div>
            ) : (
              <ProjectStep key={customer.id} customerId={customer.id} docs={choice?.key ?? ""} initial={projects} total={projectTotal} />
            )}
          </Card>
        )}

        {/* Step 3: document */}
        {customer && proj && (
          <form className="grid gap-4">
            <input type="hidden" name="customer" value={customer.id} />
            <input type="hidden" name="project" value={proj.id} />
            <Card className="p-4 sm:p-5">
              <p className="eyebrow mb-3">{step(3, "Agreement type")}</p>
              <div role="radiogroup" aria-label="Agreement type" className="grid gap-2.5 sm:grid-cols-3">
                {CHOICES.map(({ key, label, blurb, next, Icon }) => (
                  <label key={key} className="relative flex min-h-28 cursor-pointer flex-col gap-1 rounded-xl border border-line bg-surface p-4 transition-colors hover:border-bronze has-[:checked]:border-bronze has-[:checked]:bg-bronze/10 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-bronze/50">
                    <input type="radio" name="docs" value={key} required defaultChecked={sp.docs === key} className="peer sr-only" />
                    <span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full border border-line text-transparent transition-colors peer-checked:border-bronze peer-checked:bg-bronze peer-checked:text-cream" aria-hidden>
                      <Check size={12} strokeWidth={3} />
                    </span>
                    <Icon size={22} strokeWidth={1.5} className="mb-1 text-bronze" />
                    <span className="pr-6 text-sm font-medium">{label}</span>
                    <span className="text-xs text-muted">{blurb}</span>
                    <span className="mt-1 text-xs text-bronze">{next}</span>
                  </label>
                ))}
              </div>
            </Card>
            <div className="flex flex-wrap items-center gap-3">
              <Link href={`/agreements/new?customer=${customer.id}${choice ? `&docs=${choice.key}` : ""}`} className="inline-flex items-center gap-1 text-sm text-muted hover:text-walnut">
                <ArrowLeft size={14} /> Back to project
              </Link>
              <button className={btnOutline}>{ready ? "Update selection" : "Continue"}</button>
            </div>
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
              <AgreementReview customerId={customer.id} projectId={proj.id} docsKey={sp.docs ?? ""}>
                <DraftFields types={types} clientName={ctx.clientName} quote={ctx.quote} quoteEntry={needsQuote} quoteKey={proj.id} values={{ ...EMPTY_INPUTS, ...ctx.defaults }} />
              </AgreementReview>
            )}
          </>
        )}
      </div>
    </div>
  );
}
