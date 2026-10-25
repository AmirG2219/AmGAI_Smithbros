// Pure helpers: turn project, client and accepted-quote facts plus staff-entered fields into template values.
// No pricing, wording or legal terms live here; those come from the accepted quote and the approved template.

export type DocType = "work_contract" | "policy_liability";

export const DOC_NAME: Record<DocType, string> = {
  work_contract: "Work Contract",
  policy_liability: "Policy / Liability Agreement",
};

// Fields staff may complete or correct. Stored with the draft so it can be edited again.
export type Inputs = {
  site_address: string;
  client_email: string;
  client_phone: string;
  deposit_percent: string;
  payment_terms: string;
  start_date: string; // yyyy-mm-dd
  completion_estimate: string;
};

export const EMPTY_INPUTS: Inputs = {
  site_address: "",
  client_email: "",
  client_phone: "",
  deposit_percent: "",
  payment_terms: "",
  start_date: "",
  completion_estimate: "",
};

export const TBC = "[to be completed]";
const TZ = "America/Edmonton";
const COMPANY = "Smith Bros Floors";

export const cents = (n: number) => Math.round(n * 100) / 100;
export const money = (n: number) => n.toLocaleString("en-CA", { style: "currency", currency: "CAD" });
export const longDate = (d: Date) =>
  d.toLocaleDateString("en-CA", { timeZone: TZ, year: "numeric", month: "long", day: "numeric" });

export type Quote = { id: string; scope: string; exclusions: string | null; subtotal: number; tax: number };

export function parseDeposit(s: string): number | null {
  if (!s.trim()) return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;
}

export function financials(subtotal: number, tax: number, depositPercent: number) {
  const total = cents(subtotal + tax);
  const deposit = cents((total * depositPercent) / 100);
  return { total, deposit, balance: cents(total - deposit) };
}

// What must still be filled in before the final PDF can be generated.
export function missingFields(type: DocType, i: Inputs): string[] {
  const out: string[] = [];
  if (!i.site_address.trim()) out.push("Job site address");
  if (type === "work_contract") {
    if (parseDeposit(i.deposit_percent) === null) out.push("Deposit percentage (0 to 100)");
    if (!i.start_date) out.push("Planned start date");
    if (!i.completion_estimate.trim()) out.push("Estimated completion");
  }
  return out;
}

export function buildVars(a: {
  type: DocType;
  today: Date;
  clientName: string;
  inputs: Inputs;
  quote: Quote | null;
}): Record<string, string> {
  const { inputs: i } = a;
  const common = {
    company_name: COMPANY,
    contract_date: longDate(a.today),
    client_name: a.clientName,
    client_email: i.client_email.trim() || "Not provided",
    client_phone: i.client_phone.trim() || "Not provided",
    site_address: i.site_address.trim() || TBC,
  };
  if (a.type === "policy_liability" || !a.quote) return common;

  const q = a.quote;
  const pct = parseDeposit(i.deposit_percent);
  const f = pct === null ? null : financials(q.subtotal, q.tax, pct);
  return {
    ...common,
    scope_of_work: q.scope,
    exclusions: q.exclusions?.trim() || "None stated.",
    subtotal: money(q.subtotal),
    tax: money(q.tax),
    total: money(cents(q.subtotal + q.tax)),
    deposit_percent: pct === null ? TBC : String(pct),
    deposit_amount: f ? money(f.deposit) : TBC,
    balance_amount: f ? money(f.balance) : TBC,
    payment_terms: i.payment_terms.trim() || "No additional payment terms.",
    start_date: i.start_date ? longDate(new Date(`${i.start_date}T12:00:00`)) : TBC,
    completion_estimate: i.completion_estimate.trim() || TBC,
  };
}

// The snapshot holds the filled values plus the staff inputs (so a draft can be re-opened) and revision info.
export type Snapshot = Record<string, unknown> & {
  _inputs?: Partial<Inputs>;
  _revision?: number;
  _revision_of?: string;
};

export const inputsOf = (snap: Snapshot | null | undefined): Inputs => ({ ...EMPTY_INPUTS, ...(snap?._inputs ?? {}) });
// ---- Manual customer, project and quote entry (pure validation; the database calls live in build.ts) ----

export const PROJECT_TYPE_CHOICES = ["new_installation", "sand_refinish", "restoration", "commercial"] as const;

export type NewCustomer = { first_name: string; last_name: string | null; email: string | null; phone: string | null };

const clean = (s: unknown, max: number) => String(s ?? "").trim().slice(0, max);

export function parseCustomer(i: Record<string, unknown>): { ok: true; value: NewCustomer } | { ok: false; error: string } {
  const first_name = clean(i.first_name, 100);
  const email = clean(i.email, 254).toLowerCase() || null;
  if (!first_name) return { ok: false, error: "Enter the customer's first name." };
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: "That email address doesn't look right." };
  return { ok: true, value: { first_name, last_name: clean(i.last_name, 100) || null, email, phone: clean(i.phone, 40) || null } };
}

// Last 10 digits of a phone number, used only to spot an existing customer with the same number.
export const phoneKey = (p: string | null | undefined) => {
  const d = (p ?? "").replace(/\D/g, "");
  return d.length >= 7 ? d.slice(-10) : null;
};

export type NewProject = { project_type: string; site_address_line1: string; site_city: string | null; site_postal_code: string | null };

export function parseProject(i: Record<string, unknown>): { ok: true; value: NewProject } | { ok: false; error: string } {
  const project_type = clean(i.project_type, 40);
  const site_address_line1 = clean(i.site_address_line1, 200);
  if (!(PROJECT_TYPE_CHOICES as readonly string[]).includes(project_type)) return { ok: false, error: "Choose a project type." };
  if (!site_address_line1) return { ok: false, error: "Enter the job site street address." };
  return { ok: true, value: { project_type, site_address_line1, site_city: clean(i.site_city, 100) || null, site_postal_code: clean(i.site_postal_code, 20) || null } };
}

export type QuoteEntry = { scope: string; exclusions: string | null; subtotal: number; tax: number };

// A price and scope typed in by staff. Nothing is defaulted: price, tax rate and the confirmation must all be given.
export function parseQuoteEntry(i: { scope?: unknown; exclusions?: unknown; subtotal?: unknown; taxRate?: unknown; confirmed?: unknown }): { ok: true; value: QuoteEntry } | { ok: false; error: string } {
  const scope = clean(i.scope, 4000);
  if (!scope) return { ok: false, error: "Describe the agreed scope of work." };
  const subtotalText = clean(i.subtotal, 20);
  const subtotal = subtotalText === "" ? NaN : Number(subtotalText);
  if (!Number.isFinite(subtotal) || subtotal <= 0) return { ok: false, error: "Enter the agreed price before tax." };
  const rateText = clean(i.taxRate, 10);
  const rate = rateText === "" ? NaN : Number(rateText);
  if (!Number.isFinite(rate) || rate < 0 || rate > 100) return { ok: false, error: "Enter the tax rate (0 to 100 percent), for example 5 for GST." };
  if (i.confirmed !== true) return { ok: false, error: "Confirm that the customer agreed to this price and scope." };
  return { ok: true, value: { scope, exclusions: clean(i.exclusions, 2000) || null, subtotal: cents(subtotal), tax: cents((cents(subtotal) * rate) / 100) } };
}

export const stringVars = (snap: Snapshot): Record<string, string> =>
  Object.fromEntries(Object.entries(snap).filter(([k, v]) => !k.startsWith("_") && typeof v === "string")) as Record<string, string>;
