import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { renderAgreementPdf } from "./render";

export class UserError extends Error {}

export type DocType = "work_contract" | "policy_liability";

export type AgreementInput = {
  projectId: string | null; // existing lead, or null to create a new client
  client: { first_name: string; last_name: string | null; email: string | null; phone: string | null };
  site: { line1: string | null; city: string | null; postal: string | null };
  docs: DocType[];
  scope: string | null;
  exclusions: string | null;
  subtotal: number | null;
  taxRatePercent: number;
  paymentTerms: string | null;
  startDate: string | null; // yyyy-mm-dd
  completionEstimate: string | null;
  customerAccepted: boolean;
};

const TZ = "America/Edmonton";
const money = (n: number) =>
  n.toLocaleString("en-CA", { style: "currency", currency: "CAD" });
const cents = (n: number) => Math.round(n * 100) / 100;
const longDate = (d: Date) =>
  d.toLocaleDateString("en-CA", { timeZone: TZ, year: "numeric", month: "long", day: "numeric" });

export async function createAgreements(
  db: SupabaseClient,
  adminId: string,
  input: AgreementInput,
): Promise<{ projectId: string; agreementIds: string[] }> {
  if (input.docs.length === 0) throw new UserError("Choose at least one document.");

  // ---- 1. Client and project -------------------------------------------------------------
  let projectId = input.projectId;
  let contactId: string;

  if (projectId) {
    const { data, error } = await db.from("projects").select("contact_id").eq("id", projectId).single();
    if (error || !data) throw new UserError("That lead could not be found.");
    contactId = data.contact_id;
  } else {
    if (!input.client.first_name) throw new UserError("Enter the client's first name.");
    const email = input.client.email?.trim().toLowerCase() || null;
    const found = email
      ? await db.from("contacts").select("id").eq("email_normalized", email).maybeSingle()
      : { data: null };
    if (found.data) contactId = found.data.id;
    else {
      const c = await db
        .from("contacts")
        .insert({ ...input.client, email, source: "manual" })
        .select("id")
        .single();
      if (c.error) throw c.error;
      contactId = c.data.id;
    }
    const p = await db
      .from("projects")
      .insert({ contact_id: contactId, additional_answers: { origin: "agreement_form" } })
      .select("id")
      .single();
    if (p.error) throw p.error;
    projectId = p.data.id as string;
  }

  // Save the site address on the project if given.
  const site = Object.fromEntries(
    Object.entries({
      site_address_line1: input.site.line1,
      site_city: input.site.city,
      site_postal_code: input.site.postal,
    }).filter(([, v]) => v),
  );
  if (Object.keys(site).length) await db.from("projects").update(site).eq("id", projectId);

  const { data: project } = await db
    .from("projects")
    .select("site_address_line1, site_city, site_region, site_postal_code, contacts(first_name, last_name)")
    .eq("id", projectId)
    .single();
  const contact = Array.isArray(project?.contacts) ? project?.contacts[0] : project?.contacts;
  const clientName = [contact?.first_name, contact?.last_name].filter(Boolean).join(" ");
  const siteAddress =
    [project?.site_address_line1, project?.site_city, project?.site_region, project?.site_postal_code]
      .filter(Boolean)
      .join(", ") || "To be confirmed";

  // ---- 2. Accepted quote (work contract only) --------------------------------------------
  let quote: { id: string; scope: string; exclusions: string | null; subtotal: number; tax: number } | null = null;
  if (input.docs.includes("work_contract")) {
    const existing = await db
      .from("final_quotes")
      .select("id, scope_of_work, exclusions, subtotal_amount, tax_amount")
      .eq("project_id", projectId)
      .eq("status", "accepted")
      .maybeSingle();
    if (existing.data) {
      // One accepted quote per project: the contract uses it, so the price cannot drift from the quote.
      quote = {
        id: existing.data.id,
        scope: existing.data.scope_of_work,
        exclusions: existing.data.exclusions,
        subtotal: Number(existing.data.subtotal_amount),
        tax: Number(existing.data.tax_amount),
      };
    } else {
      if (!input.scope) throw new UserError("Describe the scope of work.");
      if (!input.subtotal || input.subtotal <= 0) throw new UserError("Enter the price before tax.");
      if (!input.customerAccepted)
        throw new UserError("Confirm the customer has accepted this price before creating a work contract.");

      const subtotal = cents(input.subtotal);
      const tax = cents((subtotal * input.taxRatePercent) / 100);
      const { data: last } = await db
        .from("final_quotes")
        .select("revision_number")
        .eq("project_id", projectId)
        .order("revision_number", { ascending: false })
        .limit(1)
        .maybeSingle();
      const q = await db
        .from("final_quotes")
        .insert({
          project_id: projectId,
          revision_number: (last?.revision_number ?? 0) + 1,
          status: "draft",
          scope_of_work: input.scope,
          exclusions: input.exclusions,
          subtotal_amount: subtotal,
          tax_amount: tax,
          created_by: adminId,
        })
        .select("id")
        .single();
      if (q.error) throw q.error;

      const now = new Date().toISOString();
      const ap = await db
        .from("final_quotes")
        .update({ status: "approved", approved_by: adminId, approved_at: now })
        .eq("id", q.data.id);
      if (ap.error) throw ap.error;
      const ac = await db
        .from("final_quotes")
        .update({
          status: "accepted",
          accepted_at: now,
          acceptance_recorded_by: adminId,
          acceptance_note: "Recorded by staff when creating the work contract.",
        })
        .eq("id", q.data.id);
      if (ac.error) throw ac.error;
      quote = { id: q.data.id, scope: input.scope, exclusions: input.exclusions, subtotal, tax };
    }
  }

  // ---- 3. Agreements and PDFs ------------------------------------------------------------
  const common = {
    company_name: "Smith Bros Floors",
    contract_date: longDate(new Date()),
    client_name: clientName,
    site_address: siteAddress,
  };
  const varsFor = (type: DocType): Record<string, string> =>
    type === "policy_liability" || !quote
      ? common
      : {
          ...common,
          scope_of_work: quote.scope,
          exclusions: quote.exclusions || "None stated.",
          subtotal: money(quote.subtotal),
          tax: money(quote.tax),
          total: money(cents(quote.subtotal + quote.tax)),
          payment_terms: input.paymentTerms || "To be agreed.",
          start_date: input.startDate
            ? longDate(new Date(`${input.startDate}T12:00:00`))
            : "To be confirmed",
          completion_estimate: input.completionEstimate || "To be confirmed",
        };

  const agreementIds: string[] = [];
  for (const type of input.docs) {
    const { data: version } = await db
      .from("agreement_template_versions")
      .select("id, template_storage_path, agreement_templates!inner(is_active)")
      .eq("document_type", type)
      .eq("status", "approved")
      .eq("agreement_templates.is_active", true)
      .maybeSingle();
    if (!version) throw new UserError(`No approved template for ${type.replace("_", " ")}.`);

    const vars = varsFor(type);
    const ag = await db
      .from("agreements")
      .insert({
        project_id: projectId,
        document_type: type,
        template_version_id: version.id,
        final_quote_id: type === "work_contract" ? quote?.id : null,
        status: "draft",
        rendered_data_snapshot: vars,
        created_by: adminId,
      })
      .select("id")
      .single();
    if (ag.error) {
      if (ag.error.code === "23505")
        throw new UserError(
          `This client already has a current ${type.replace("_", " ")}. Cancel or replace it first.`,
        );
      throw ag.error;
    }
    const agreementId = ag.data.id as string;

    try {
      const tpl = await db.storage.from("agreements").download(version.template_storage_path);
      if (tpl.error) throw tpl.error;
      const pdf = await renderAgreementPdf({
        template: await tpl.data.text(),
        vars,
        footerId: `Agreement ${agreementId.slice(0, 8)}`,
      });
      const path = `${projectId}/${agreementId}/generated-r1.pdf`;
      const up = await db.storage.from("agreements").upload(path, pdf, {
        contentType: "application/pdf",
        upsert: false,
      });
      if (up.error) throw up.error;

      const doc = await db.from("agreement_documents").insert({
        agreement_id: agreementId,
        document_kind: "generated",
        revision_number: 1,
        storage_path: path,
        sha256: createHash("sha256").update(pdf).digest("hex"),
        mime_type: "application/pdf",
        size_bytes: pdf.byteLength,
        uploaded_by: adminId,
      });
      if (doc.error) throw doc.error;
      const gen = await db.from("agreements").update({ status: "generated" }).eq("id", agreementId);
      if (gen.error) throw gen.error;
    } catch (e) {
      // Free the "one current agreement" slot so the form can simply be submitted again.
      await db.from("agreements").update({ status: "cancelled" }).eq("id", agreementId);
      throw e;
    }

    await db.from("events").insert({
      contact_id: contactId,
      project_id: projectId,
      event_type: "agreement.generated",
      summary: `${type === "work_contract" ? "Work contract" : "Policy and liability agreement"} generated`,
      details: { agreement_id: agreementId },
      actor_user_id: adminId,
      source: "dashboard",
    });
    agreementIds.push(agreementId);
  }

  return { projectId, agreementIds };
}
