import type { SupabaseClient } from "@supabase/supabase-js";
import { UserError, loadApprovedTemplate, loadContext, preflight, type Blocker } from "./build";
import { renderAgreementPdf } from "./render";
import {
  DOC_NAME,
  EMPTY_INPUTS,
  buildVars,
  cents,
  financials,
  missingFields,
  parseDeposit,
  parseQuoteEntry,
  type DocType,
  type Inputs,
  type Quote,
  type QuoteEntry,
} from "./vars";

// The Create Agreement form as submitted, read one way for the review, the preview and the real creation, so all three
// work from the same values. Nothing here trusts the browser: every value is parsed and checked again on the server.

export const DOCS: Record<string, DocType[]> = {
  policy: ["policy_liability"],
  contract: ["work_contract"],
  both: ["policy_liability", "work_contract"],
};

const UUID = /^[0-9a-f-]{36}$/i;
const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

export type ParsedForm = {
  customer: string;
  project: string;
  docsKey: string;
  docs: DocType[];
  inputs: Inputs;
  quoteEntry: { ok: true; value: QuoteEntry; taxRate: number } | { ok: false; error: string } | null; // null: no price entry was sent
  values: Record<string, string>; // exactly what is sent again to create the agreement
};

export function readAgreementForm(f: FormData): ParsedForm {
  const inputs = { ...EMPTY_INPUTS, ...Object.fromEntries(Object.keys(EMPTY_INPUTS).map((k) => [k, str(f, k)])) } as Inputs;
  const docsKey = DOCS[str(f, "docs")] ? str(f, "docs") : "";
  const values: Record<string, string> = {
    customer: UUID.test(str(f, "customer")) ? str(f, "customer") : "",
    project: UUID.test(str(f, "project")) ? str(f, "project") : "",
    docs: docsKey,
    ...inputs,
  };
  let quoteEntry: ParsedForm["quoteEntry"] = null;
  if (f.has("q_scope")) {
    const q = parseQuoteEntry({
      scope: f.get("q_scope"),
      exclusions: f.get("q_exclusions"),
      subtotal: f.get("q_subtotal"),
      taxRate: f.get("q_tax_rate"),
      confirmed: f.get("q_confirm") === "on",
    });
    quoteEntry = q.ok ? { ok: true, value: q.value, taxRate: Number(str(f, "q_tax_rate")) } : q;
    Object.assign(values, {
      q_scope: String(f.get("q_scope") ?? ""),
      q_exclusions: String(f.get("q_exclusions") ?? ""),
      q_subtotal: str(f, "q_subtotal"),
      q_tax_rate: str(f, "q_tax_rate"),
      ...(f.get("q_confirm") === "on" ? { q_confirm: "on" } : {}),
    });
  }
  return { customer: values.customer, project: values.project, docsKey, docs: DOCS[docsKey] ?? [], inputs, quoteEntry, values };
}

export type Review = {
  values: Record<string, string>;
  customer: { name: string; email: string; phone: string };
  project: { name: string | null; type: string | null; site: string };
  docs: { type: DocType; name: string; placeholder: boolean; missing: string[] }[];
  blockers: Blocker[];
  contract: null | {
    source: "accepted" | "entered";
    scope: string;
    exclusions: string;
    subtotal: number;
    tax: number;
    taxRate: number | null;
    total: number;
    depositPercent: number | null;
    deposit: number | null;
    balance: number | null;
    paymentTerms: string;
    startDate: string;
    completion: string;
  };
};

// What the quote will be, without recording anything: the accepted one on file, or the one staff just typed in.
async function resolveQuote(db: SupabaseClient, p: ParsedForm) {
  const ctx = await loadContext(db, p.project);
  const wantsContract = p.docs.includes("work_contract");
  let quote: Quote | null = ctx.quote;
  let source: "accepted" | "entered" = "accepted";
  if (wantsContract && !quote) {
    if (!p.quoteEntry) throw new UserError(`${ctx.quoteProblem} A work contract can only be built from an accepted final quote.`);
    if (!p.quoteEntry.ok) throw new UserError(p.quoteEntry.error);
    const q = p.quoteEntry.value;
    quote = { id: "unsaved", scope: q.scope, exclusions: q.exclusions, subtotal: q.subtotal, tax: q.tax };
    source = "entered";
  }
  return { ctx, quote, source };
}

export async function prepareReview(db: SupabaseClient, p: ParsedForm): Promise<{ review: Review; vars: Partial<Record<DocType, Record<string, string>>> }> {
  if (!p.project || !p.customer) throw new UserError("Choose a customer and project first.");
  if (!p.docs.length) throw new UserError("Choose which document to create.");
  const { ctx, quote, source } = await resolveQuote(db, p);
  if (ctx.contactId !== p.customer) throw new UserError("That project belongs to a different customer. Start again from the customer step.");

  const blockers = await preflight(db, p.project, p.docs, { allowNewQuote: p.quoteEntry?.ok === true });
  const { data: proj } = await db.from("projects").select("additional_answers").eq("id", p.project).maybeSingle();
  const projectName = ((proj?.additional_answers ?? {}) as { project_name?: string }).project_name ?? null;

  // Same values and same function the stored draft uses, so the review cannot differ from the generated document.
  const vars: Partial<Record<DocType, Record<string, string>>> = {};
  const docs: Review["docs"] = [];
  for (const type of p.docs) {
    vars[type] = buildVars({ type, today: new Date(), clientName: ctx.clientName, inputs: p.inputs, quote: type === "work_contract" ? quote : null });
    let placeholder = false;
    try {
      placeholder = (await loadApprovedTemplate(db, type)).placeholder;
    } catch {
      // surfaced by preflight as a blocker
    }
    docs.push({ type, name: DOC_NAME[type], placeholder, missing: missingFields(type, p.inputs) });
  }

  let contract: Review["contract"] = null;
  if (p.docs.includes("work_contract") && quote) {
    const pct = parseDeposit(p.inputs.deposit_percent);
    const f = pct === null ? null : financials(quote.subtotal, quote.tax, pct);
    contract = {
      source,
      scope: quote.scope,
      exclusions: quote.exclusions?.trim() ?? "",
      subtotal: quote.subtotal,
      tax: quote.tax,
      taxRate: source === "entered" && p.quoteEntry?.ok ? p.quoteEntry.taxRate : quote.subtotal > 0 ? cents((quote.tax / quote.subtotal) * 100) : null,
      total: cents(quote.subtotal + quote.tax),
      depositPercent: pct,
      deposit: f?.deposit ?? null,
      balance: f?.balance ?? null,
      paymentTerms: p.inputs.payment_terms.trim(),
      startDate: p.inputs.start_date,
      completion: p.inputs.completion_estimate.trim(),
    };
  }

  return {
    vars,
    review: {
      values: p.values,
      customer: { name: ctx.clientName, email: p.inputs.client_email || ctx.defaults.client_email, phone: p.inputs.client_phone || ctx.defaults.client_phone },
      project: { name: projectName, type: ctx.projectType, site: p.inputs.site_address || ctx.defaults.site_address },
      docs,
      blockers,
      contract,
    },
  };
}

// The customer-facing PDF for one document, built in memory from the reviewed values. Nothing is saved.
export async function renderPreview(db: SupabaseClient, p: ParsedForm, type: DocType): Promise<Uint8Array> {
  if (!p.docs.includes(type)) throw new UserError("That document is not part of this agreement.");
  const { vars } = await prepareReview(db, p);
  const tpl = await loadApprovedTemplate(db, type);
  try {
    return await renderAgreementPdf({ template: tpl.text, vars: vars[type] ?? {}, footerId: "PREVIEW · not saved · no agreement created" });
  } catch (e) {
    throw new UserError(e instanceof Error ? e.message : "The template could not be filled in.");
  }
}
