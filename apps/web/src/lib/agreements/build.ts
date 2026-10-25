import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { renderAgreementPdf } from "./render";
import {
  DOC_NAME,
  buildVars,
  inputsOf,
  missingFields,
  parseCustomer,
  parseProject,
  phoneKey,
  stringVars,
  type DocType,
  type Inputs,
  type Quote,
  type QuoteEntry,
  type Snapshot,
} from "./vars";

export class UserError extends Error {}

const BUCKET = "agreements";
const label = (t: DocType) => DOC_NAME[t];

export type Template = { versionId: string; name: string; text: string; placeholder: boolean };

// The approved version of the active template for this document type, with its text checked against the
// stored checksum. Throws a UserError that says what is missing.
export async function loadApprovedTemplate(db: SupabaseClient, type: DocType): Promise<Template> {
  const { data: v } = await db
    .from("agreement_template_versions")
    .select("id, template_storage_path, template_sha256, agreement_templates!inner(name, is_active)")
    .eq("document_type", type)
    .eq("status", "approved")
    .eq("agreement_templates.is_active", true)
    .maybeSingle();
  if (!v) throw new UserError(`There is no approved ${label(type)} template. Smith Bros must supply and approve one first.`);
  return readTemplate(db, v);
}

type VersionRow = { id: string; template_storage_path: string; template_sha256: string; agreement_templates: unknown };

async function readTemplate(db: SupabaseClient, v: VersionRow): Promise<Template> {
  const file = await db.storage.from(BUCKET).download(v.template_storage_path);
  if (file.error) throw new UserError("The approved template file could not be read from storage.");
  const bytes = Buffer.from(await file.data.arrayBuffer());
  if (createHash("sha256").update(bytes).digest("hex") !== v.template_sha256)
    throw new UserError("The template file does not match its approved checksum, so it was not used.");
  const t = Array.isArray(v.agreement_templates) ? v.agreement_templates[0] : v.agreement_templates;
  const name = String((t as { name?: string } | null)?.name ?? "Template");
  return { versionId: v.id, name, text: bytes.toString("utf8"), placeholder: /placeholder/i.test(name) };
}

export type Context = {
  projectId: string;
  contactId: string;
  clientName: string;
  projectType: string | null;
  defaults: Pick<Inputs, "site_address" | "client_email" | "client_phone">;
  quote: Quote | null;
  quoteProblem: string | null;
  quoteMissing: boolean; // no accepted quote at all, so staff may record one (as opposed to an unusable one)
};

// Known client, site and accepted-quote facts for a project.
export async function loadContext(db: SupabaseClient, projectId: string): Promise<Context> {
  const { data: p } = await db
    .from("projects")
    .select(
      "id, contact_id, project_type, site_address_line1, site_city, site_region, site_postal_code, contacts(first_name, last_name, email, phone)",
    )
    .eq("id", projectId)
    .maybeSingle();
  if (!p) throw new UserError("That project could not be found.");
  const c = Array.isArray(p.contacts) ? p.contacts[0] : p.contacts;

  const { data: q } = await db
    .from("final_quotes")
    .select("id, scope_of_work, exclusions, subtotal_amount, tax_amount")
    .eq("project_id", projectId)
    .eq("status", "accepted")
    .maybeSingle();
  let quote: Quote | null = null;
  let quoteProblem: string | null = null;
  if (!q) quoteProblem = "This project has no accepted final quote.";
  else if (!q.scope_of_work?.trim() || q.subtotal_amount == null || q.tax_amount == null)
    quoteProblem = "The accepted final quote is missing its scope of work or amounts.";
  else
    quote = {
      id: q.id,
      scope: q.scope_of_work,
      exclusions: q.exclusions,
      subtotal: Number(q.subtotal_amount),
      tax: Number(q.tax_amount),
    };

  return {
    projectId,
    contactId: p.contact_id,
    clientName: [c?.first_name, c?.last_name].filter(Boolean).join(" "),
    projectType: p.project_type,
    defaults: {
      site_address: [p.site_address_line1, p.site_city, p.site_region, p.site_postal_code].filter(Boolean).join(", "),
      client_email: c?.email ?? "",
      client_phone: c?.phone ?? "",
    },
    quote,
    quoteProblem,
    quoteMissing: !q,
  };
}

export type Blocker = { text: string; href?: string };

// Everything that stops a document being built for this project, in plain words. Empty means ready.
export async function preflight(db: SupabaseClient, projectId: string, docs: DocType[], opts: { allowNewQuote?: boolean } = {}): Promise<Blocker[]> {
  const out: Blocker[] = [];
  const ctx = await loadContext(db, projectId);
  const { data: current } = await db
    .from("agreements")
    .select("id, document_type")
    .eq("project_id", projectId)
    .not("status", "in", "(cancelled,superseded)");
  for (const t of docs) {
    const mine = (current ?? []).find((a) => a.document_type === t);
    if (mine)
      out.push({
        text: `This project already has a current ${label(t)}. Open it to edit the draft or create a revision.`,
        href: `/agreements/${mine.id}`,
      });
    try {
      await loadApprovedTemplate(db, t);
    } catch (e) {
      if (e instanceof UserError) out.push({ text: e.message });
      else throw e;
    }
  }
  if (docs.includes("work_contract") && ctx.quoteProblem && !(opts.allowNewQuote && ctx.quoteMissing))
    out.push({
      text: `${ctx.quoteProblem} A work contract can only be built from an accepted final quote.`,
      href: `/leads/${projectId}`,
    });
  return out;
}

export async function createDrafts(
  db: SupabaseClient,
  adminId: string,
  projectId: string,
  docs: DocType[],
  inputs: Inputs,
  revision?: { of: string; number: number },
  newQuote?: QuoteEntry,
): Promise<string[]> {
  if (!docs.length) throw new UserError("Choose which document to create.");
  const blockers = await preflight(db, projectId, docs, { allowNewQuote: !!newQuote });
  if (blockers.length) throw new UserError(blockers[0].text);
  let ctx = await loadContext(db, projectId);
  // A work contract needs an accepted quote. If there is none, staff may record the agreed price here (all checks ran first).
  if (docs.includes("work_contract") && !ctx.quote) {
    if (!newQuote) throw new UserError(`${ctx.quoteProblem} A work contract can only be built from an accepted final quote.`);
    await recordAcceptedQuote(db, adminId, ctx, newQuote);
    ctx = await loadContext(db, projectId);
  }

  const ids: string[] = [];
  try {
    await draftEach();
  } catch (e) {
    // Don't leave half a set behind: cancel any draft already created in this call (this frees the slot to try again).
    for (const id of ids) await db.from("agreements").update({ status: "cancelled" }).eq("id", id);
    throw e;
  }
  return ids;

  async function draftEach() {
  for (const type of docs) {
    const tpl = await loadApprovedTemplate(db, type);
    const snap: Snapshot = {
      ...buildVars({ type, today: new Date(), clientName: ctx.clientName, inputs, quote: ctx.quote }),
      _inputs: inputs,
      _revision: revision?.number ?? 1,
      ...(revision ? { _revision_of: revision.of } : {}),
    };
    const ag = await db
      .from("agreements")
      .insert({
        project_id: projectId,
        document_type: type,
        template_version_id: tpl.versionId,
        final_quote_id: type === "work_contract" ? ctx.quote?.id : null,
        status: "draft",
        rendered_data_snapshot: snap,
        created_by: adminId,
      })
      .select("id")
      .single();
    if (ag.error) {
      if (ag.error.code === "23505") throw new UserError(`This project already has a current ${label(type)}.`);
      throw ag.error;
    }
    await logEvent(db, ctx, ag.data.id, adminId, "agreement.draft_created", revision ? `${label(type)} revision ${revision.number} drafted` : `${label(type)} drafted`);
    ids.push(ag.data.id as string);
  }
  }
}

type DraftRow = {
  id: string;
  project_id: string;
  document_type: DocType;
  status: string;
  rendered_data_snapshot: Snapshot;
  template_version_id: string;
};

async function loadDraft(db: SupabaseClient, id: string): Promise<DraftRow> {
  const { data } = await db
    .from("agreements")
    .select("id, project_id, document_type, status, rendered_data_snapshot, template_version_id")
    .eq("id", id)
    .maybeSingle();
  if (!data) throw new UserError("That agreement could not be found.");
  if (data.status !== "draft") throw new UserError("Only a draft can be changed. Create a revision instead.");
  return data as DraftRow;
}

// Re-reads the client, site and accepted quote so a draft always reflects the current records.
async function refreshedSnapshot(db: SupabaseClient, d: DraftRow, inputs: Inputs) {
  const ctx = await loadContext(db, d.project_id);
  if (d.document_type === "work_contract" && !ctx.quote)
    throw new UserError(`${ctx.quoteProblem} A work contract can only be built from an accepted final quote.`);
  const snap: Snapshot = {
    ...buildVars({ type: d.document_type, today: new Date(), clientName: ctx.clientName, inputs, quote: ctx.quote }),
    _inputs: inputs,
    _revision: d.rendered_data_snapshot._revision ?? 1,
    ...(d.rendered_data_snapshot._revision_of ? { _revision_of: d.rendered_data_snapshot._revision_of } : {}),
  };
  return { ctx, snap };
}

export async function updateDraft(db: SupabaseClient, adminId: string, id: string, inputs: Inputs) {
  const d = await loadDraft(db, id);
  const { ctx, snap } = await refreshedSnapshot(db, d, inputs);
  const up = await db
    .from("agreements")
    .update({
      rendered_data_snapshot: snap,
      final_quote_id: d.document_type === "work_contract" ? ctx.quote?.id : null,
    })
    .eq("id", id);
  if (up.error) throw up.error;
  await logEvent(db, ctx, id, adminId, "agreement.draft_edited", `${label(d.document_type)} draft edited`);
}

// Renders the PDF for a draft from its saved values, without storing anything (used for the live preview).
export async function renderDraftPdf(db: SupabaseClient, id: string): Promise<Uint8Array> {
  const { data } = await db
    .from("agreements")
    .select("id, project_id, document_type, status, rendered_data_snapshot, template_version_id")
    .eq("id", id)
    .maybeSingle();
  if (!data) throw new UserError("That agreement could not be found.");
  const d = data as DraftRow;
  const { snap } = d.status === "draft" ? await refreshedSnapshot(db, d, inputsOf(d.rendered_data_snapshot)) : { snap: d.rendered_data_snapshot };
  return renderFor(db, d, stringVars(snap), snap._revision ?? 1, d.status === "draft");
}

async function renderFor(db: SupabaseClient, d: DraftRow, vars: Record<string, string>, revision: number, draft: boolean) {
  const { data: v } = await db
    .from("agreement_template_versions")
    .select("id, template_storage_path, template_sha256, agreement_templates(name)")
    .eq("id", d.template_version_id)
    .single();
  const tpl = await readTemplate(db, v as VersionRow);
  try {
    return await renderAgreementPdf({
      template: tpl.text,
      vars,
      footerId: `${draft ? "DRAFT · " : ""}Agreement ${d.id.slice(0, 8)} · Revision ${revision}`,
    });
  } catch (e) {
    throw new UserError(e instanceof Error ? e.message : "The template could not be filled in.");
  }
}

// Turns a complete draft into the stored, branded PDF and marks it ready to send.
export async function generateDocument(db: SupabaseClient, adminId: string, id: string) {
  const d = await loadDraft(db, id);
  const inputs = inputsOf(d.rendered_data_snapshot);
  const missing = missingFields(d.document_type, inputs);
  if (missing.length) throw new UserError(`Complete these fields first: ${missing.join(", ")}.`);

  const { ctx, snap } = await refreshedSnapshot(db, d, inputs);
  const revision = snap._revision ?? 1;
  const pdf = await renderFor(db, d, stringVars(snap), revision, false);

  const path = `${d.project_id}/${id}/generated-r1.pdf`;
  const up = await db.storage.from(BUCKET).upload(path, pdf, { contentType: "application/pdf", upsert: true });
  if (up.error) throw up.error;

  const doc = await db.from("agreement_documents").insert({
    agreement_id: id,
    document_kind: "generated",
    revision_number: 1,
    storage_path: path,
    sha256: createHash("sha256").update(pdf).digest("hex"),
    mime_type: "application/pdf",
    size_bytes: pdf.byteLength,
    uploaded_by: adminId,
  });
  if (doc.error && doc.error.code !== "23505") throw doc.error;

  const gen = await db
    .from("agreements")
    .update({
      status: "generated",
      rendered_data_snapshot: snap,
      final_quote_id: d.document_type === "work_contract" ? ctx.quote?.id : null,
    })
    .eq("id", id);
  if (gen.error) throw new UserError(gen.error.message.replace(/^agreements: /, ""));
  await logEvent(db, ctx, id, adminId, "agreement.generated", `${label(d.document_type)} PDF generated`);
}

// Starts a new draft from an existing agreement and retires the old one. Old PDFs and signed copies stay untouched.
export async function reviseAgreement(db: SupabaseClient, adminId: string, id: string): Promise<string> {
  const { data: old } = await db
    .from("agreements")
    .select("id, project_id, document_type, status, rendered_data_snapshot")
    .eq("id", id)
    .maybeSingle();
  if (!old) throw new UserError("That agreement could not be found.");
  if (!["generated", "sent", "returned", "verified"].includes(old.status))
    throw new UserError("Only a generated, sent or signed agreement can be revised.");

  const type = old.document_type as DocType;
  // Check everything first so the old agreement is never retired for a revision that cannot be built.
  const check = (await preflight(db, old.project_id, [type])).filter((b) => !b.text.startsWith("This project already has a current"));
  if (check.length) throw new UserError(check[0].text);

  const snap = old.rendered_data_snapshot as Snapshot;
  const sup = await db.from("agreements").update({ status: "superseded" }).eq("id", id);
  if (sup.error) throw new UserError(sup.error.message.replace(/^agreements: /, ""));
  const ctx = await loadContext(db, old.project_id);
  await logEvent(db, ctx, id, adminId, "agreement.superseded", `${label(type)} revision ${snap._revision ?? 1} superseded by a new revision`);

  const [newId] = await createDrafts(db, adminId, old.project_id, [type], inputsOf(snap), {
    of: id,
    number: (snap._revision ?? 1) + 1,
  });
  return newId;
}

export async function cancelAgreement(db: SupabaseClient, adminId: string, id: string) {
  const { data: a } = await db.from("agreements").select("project_id, document_type, status").eq("id", id).maybeSingle();
  if (!a) throw new UserError("That agreement could not be found.");
  if (!["draft", "generated", "sent", "returned"].includes(a.status)) throw new UserError("This agreement cannot be cancelled.");
  const up = await db.from("agreements").update({ status: "cancelled" }).eq("id", id);
  if (up.error) throw new UserError(up.error.message.replace(/^agreements: /, ""));
  await logEvent(db, await loadContext(db, a.project_id), id, adminId, "agreement.cancelled", `${label(a.document_type as DocType)} cancelled`);
}

// ---- Manual customer, project and quote entry ----

export type PossibleMatch = { id: string; name: string; email: string | null; phone: string | null };
export type CustomerResult = { kind: "created" | "existing"; id: string } | { kind: "phone_match"; matches: PossibleMatch[] };

// Adds a customer without creating duplicates. The same email is the same customer (the database allows one per email), so that
// customer is used. The same phone number only MIGHT be the same person (shared or family numbers), so it is returned for staff
// to confirm instead of being picked automatically; pass confirmNew to create a separate customer anyway.
export async function findOrCreateCustomer(db: SupabaseClient, input: Record<string, unknown>, opts: { confirmNew?: boolean } = {}): Promise<CustomerResult> {
  const p = parseCustomer(input);
  if (!p.ok) throw new UserError(p.error);
  const c = p.value;
  if (c.email) {
    const { data } = await db.from("contacts").select("id").eq("email_normalized", c.email).maybeSingle();
    if (data) return { kind: "existing", id: data.id };
  }
  const key = phoneKey(c.phone);
  if (key && !opts.confirmNew) {
    const { data } = await db.from("contacts").select("id, first_name, last_name, email, phone").ilike("phone", `%${key.slice(-4)}%`).limit(50);
    const hits = (data ?? []).filter((r) => phoneKey(r.phone) === key);
    if (hits.length)
      return { kind: "phone_match", matches: hits.slice(0, 5).map((r) => ({ id: r.id, name: [r.first_name, r.last_name].filter(Boolean).join(" "), email: r.email, phone: r.phone })) };
  }
  const ins = await db.from("contacts").insert({ ...c, source: "manual" }).select("id").single();
  if (ins.error) {
    if (ins.error.code === "23505" && c.email) {
      const { data } = await db.from("contacts").select("id").eq("email_normalized", c.email).maybeSingle();
      if (data) return { kind: "existing", id: data.id };
    }
    throw ins.error;
  }
  return { kind: "created", id: ins.data.id as string };
}

// A project created by staff, with no website inquiry behind it.
export async function createManualProject(db: SupabaseClient, contactId: string, input: Record<string, unknown>): Promise<string> {
  const p = parseProject(input);
  if (!p.ok) throw new UserError(p.error);
  const { data: c } = await db.from("contacts").select("id").eq("id", contactId).maybeSingle();
  if (!c) throw new UserError("That customer could not be found.");
  const ins = await db
    .from("projects")
    .insert({ contact_id: contactId, ...p.value, additional_answers: { origin: "agreement_builder" } })
    .select("id")
    .single();
  if (ins.error) throw ins.error;
  return ins.data.id as string;
}

// Records a price staff have confirmed with the customer, through the normal quote lifecycle:
// draft -> approved (by this staff member) -> accepted (acceptance recorded by them, with a note).
export async function recordAcceptedQuote(
  db: SupabaseClient,
  adminId: string,
  ctx: { projectId: string; contactId: string },
  entry: QuoteEntry,
): Promise<string> {
  const { data: last } = await db
    .from("final_quotes")
    .select("revision_number")
    .eq("project_id", ctx.projectId)
    .order("revision_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  const q = await db
    .from("final_quotes")
    .insert({
      project_id: ctx.projectId,
      revision_number: (last?.revision_number ?? 0) + 1,
      status: "draft",
      scope_of_work: entry.scope,
      exclusions: entry.exclusions,
      subtotal_amount: entry.subtotal,
      tax_amount: entry.tax,
      created_by: adminId,
    })
    .select("id")
    .single();
  if (q.error) throw q.error;
  const now = new Date().toISOString();
  const ap = await db.from("final_quotes").update({ status: "approved", approved_by: adminId, approved_at: now }).eq("id", q.data.id);
  if (ap.error) throw new UserError(ap.error.message.replace(/^final_quotes: /, ""));
  const ac = await db
    .from("final_quotes")
    .update({
      status: "accepted",
      accepted_at: now,
      acceptance_recorded_by: adminId,
      acceptance_note: "Price and scope confirmed by staff as agreed with the customer, entered while creating a work contract.",
    })
    .eq("id", q.data.id);
  if (ac.error) throw new UserError(ac.error.message.replace(/^final_quotes: /, ""));
  await db.from("events").insert({
    contact_id: ctx.contactId,
    project_id: ctx.projectId,
    event_type: "final_quote.accepted",
    summary: "Final quote recorded as agreed with the customer",
    details: { final_quote_id: q.data.id },
    actor_user_id: adminId,
    source: "dashboard",
  });
  return q.data.id as string;
}

export async function logEvent(
  db: SupabaseClient,
  ctx: { contactId: string; projectId: string },
  agreementId: string,
  adminId: string,
  type: string,
  summary: string,
) {
  await db.from("events").insert({
    contact_id: ctx.contactId,
    project_id: ctx.projectId,
    event_type: type,
    summary,
    details: { agreement_id: agreementId },
    actor_user_id: adminId,
    source: "dashboard",
  });
}
