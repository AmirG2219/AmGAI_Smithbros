import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Card, PageHeader } from "../../ui";
import { createDocumentAction } from "../actions";

const input =
  "w-full rounded-lg border border-line bg-white px-3 py-2.5 text-sm outline-none focus:border-bronze";
const label = "mb-1 block text-xs font-medium uppercase tracking-[0.15em] text-muted";

function Field({ name, title, children }: { name: string; title: string; children: React.ReactNode }) {
  return (
    <div>
      <label className={label} htmlFor={name}>
        {title}
      </label>
      {children}
    </div>
  );
}

export default async function NewDocument({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; error?: string; project?: string }>;
}) {
  const { type, error, project } = await searchParams;

  // No document chosen: the Documents page is where that choice is made.
  if (type !== "work_contract" && type !== "policy_liability") redirect("/documents");

  const isContract = type === "work_contract";
  const other = isContract ? "policy_liability" : "work_contract";

  const supabase = await createClient();
  const { data: leads } = await supabase
    .from("projects")
    .select("id, project_type, contacts(first_name, last_name)")
    .order("created_at", { ascending: false })
    .limit(200);

  // Coming from a lead: carry its client, address and any accepted quote into the form.
  const chosen =
    project && /^[0-9a-f-]{36}$/i.test(project)
      ? await supabase
          .from("projects")
          .select("id, site_address_line1, site_city, site_postal_code, contacts(first_name, last_name, email, phone), final_quotes(status, subtotal_amount, tax_amount)")
          .eq("id", project)
          .maybeSingle()
          .then((r) => r.data)
      : null;
  const pc = chosen ? (Array.isArray(chosen.contacts) ? chosen.contacts[0] : chosen.contacts) : null;
  const accepted = chosen?.final_quotes?.find((q: { status: string }) => q.status === "accepted");

  return (
    <div>
      <Link href="/documents" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-walnut">
        <ArrowLeft size={14} /> Documents
      </Link>
      <PageHeader eyebrow="Documents" title={isContract ? "New contract" : "New agreement"}>
        <Link href={`/documents/new?type=${other}`} className="text-sm text-bronze hover:text-walnut">
          Switch to {isContract ? "an agreement" : "a contract"}
        </Link>
      </PageHeader>

      {error && (
        <p className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>
      )}

      <form action={createDocumentAction} className="grid max-w-3xl gap-5">
        <input type="hidden" name="doc_type" value={type} />

        <Card className="p-5">
          <p className="eyebrow mb-3">1. Client</p>
          <Field name="project_id" title="Existing lead">
            <select id="project_id" name="project_id" className={input} defaultValue={chosen?.id ?? ""}>
              <option value="">New client (fill in below)</option>
              {(leads ?? []).map((l) => {
                const c = Array.isArray(l.contacts) ? l.contacts[0] : l.contacts;
                return (
                  <option key={l.id} value={l.id}>
                    {c?.first_name} {c?.last_name} · {l.project_type?.replaceAll("_", " ") ?? "project"}
                  </option>
                );
              })}
            </select>
          </Field>
          {pc && (
            <p className="mt-3 rounded-lg bg-cream px-3 py-2 text-sm">
              {pc.first_name} {pc.last_name}
              {pc.email && ` · ${pc.email}`}
              {pc.phone && ` · ${pc.phone}`}
            </p>
          )}
          <p className="my-3 text-xs text-muted">New client details (ignored if you chose a lead):</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field name="first_name" title="First name">
              <input id="first_name" name="first_name" className={input} />
            </Field>
            <Field name="last_name" title="Last name">
              <input id="last_name" name="last_name" className={input} />
            </Field>
            <Field name="email" title="Email">
              <input id="email" name="email" type="email" className={input} />
            </Field>
            <Field name="phone" title="Phone">
              <input id="phone" name="phone" type="tel" className={input} />
            </Field>
          </div>
        </Card>

        <Card className="p-5">
          <p className="eyebrow mb-3">2. Job site</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field name="site_line1" title="Street address">
              <input id="site_line1" name="site_line1" defaultValue={chosen?.site_address_line1 ?? ""} className={input} />
            </Field>
            <Field name="site_city" title="City">
              <input id="site_city" name="site_city" defaultValue={chosen?.site_city ?? ""} className={input} />
            </Field>
            <Field name="site_postal" title="Postal code">
              <input id="site_postal" name="site_postal" defaultValue={chosen?.site_postal_code ?? ""} className={input} />
            </Field>
          </div>
        </Card>

        {isContract && (
          <Card className="p-5">
            <p className="eyebrow mb-1">3. The work</p>
            <p className="mb-3 text-xs text-muted">
              {accepted
                ? `This client has an accepted quote of ${Number(accepted.subtotal_amount).toLocaleString("en-CA", { style: "currency", currency: "CAD" })} before tax. It will be used, so these fields are ignored.`
                : "If this client already has an accepted quote, that quote is used and these fields are ignored."}
            </p>
            <div className="grid gap-3">
              <Field name="scope" title="Scope of work">
                <textarea id="scope" name="scope" rows={4} className={input} />
              </Field>
              <Field name="exclusions" title="Exclusions (optional)">
                <textarea id="exclusions" name="exclusions" rows={2} className={input} />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field name="subtotal" title="Price before tax (CAD)">
                  <input id="subtotal" name="subtotal" type="number" min="0" step="0.01" className={input} />
                </Field>
                <Field name="tax_rate" title="Tax rate %">
                  <input id="tax_rate" name="tax_rate" type="number" min="0" step="0.01" defaultValue="5" className={input} />
                </Field>
                <Field name="deposit_percent" title="Deposit on signing %">
                  <input id="deposit_percent" name="deposit_percent" type="number" min="0" max="100" step="1" defaultValue="50" className={input} />
                </Field>
                <Field name="start_date" title="Planned start">
                  <input id="start_date" name="start_date" type="date" className={input} />
                </Field>
                <Field name="completion_estimate" title="Estimated completion">
                  <input id="completion_estimate" name="completion_estimate" placeholder="e.g. 2 weeks after start" className={input} />
                </Field>
              </div>
              <Field name="payment_terms" title="Other payment terms (optional)">
                <textarea id="payment_terms" name="payment_terms" rows={2} className={input} />
              </Field>
              <label className="mt-1 flex items-start gap-2 text-sm">
                <input type="checkbox" name="accepted" className="mt-1" />
                <span>The customer has accepted this price and scope (required for a new contract).</span>
              </label>
            </div>
          </Card>
        )}

        <button className="rounded-lg bg-walnut px-6 py-3 text-sm font-medium text-cream hover:bg-bronze sm:w-fit">
          Create {isContract ? "contract" : "agreement"}
        </button>
      </form>
    </div>
  );
}
