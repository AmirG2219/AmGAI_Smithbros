import type { SupabaseClient } from "@supabase/supabase-js";

// Structured audience filter. The AI may propose one, but it is only ever parsed into this shape and
// turned into parameterized queries here. It is never SQL.
export type AudienceFilter = {
  project_types: string[];
  materials: string[];
  stages: string[];
  inactive_months: number | null; // only contacts whose latest project is older than this
};

export const FILTER_OPTIONS = {
  project_types: ["new_installation", "sand_refinish", "restoration", "commercial"],
  materials: ["hardwood", "engineered", "laminate", "vinyl", "tile", "unsure"],
  stages: [
    "new", "estimate_sent", "consultation_booked", "site_visit_completed",
    "final_quote_sent", "customer_accepted", "agreement_sent", "won", "lost",
  ],
} as const;

const pick = (v: unknown, allowed: readonly string[]) =>
  (Array.isArray(v) ? v : typeof v === "string" && v ? v.split(",") : [])
    .map((x) => String(x).trim())
    .filter((x) => allowed.includes(x));

export function parseFilter(raw: unknown): AudienceFilter {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const m = Number(o.inactive_months);
  return {
    project_types: pick(o.project_types, FILTER_OPTIONS.project_types),
    materials: pick(o.materials, FILTER_OPTIONS.materials),
    stages: pick(o.stages, FILTER_OPTIONS.stages),
    inactive_months: Number.isFinite(m) && m > 0 && m <= 240 ? Math.round(m) : null,
  };
}

export type Candidate = { contact_id: string; first_name: string; last_name: string | null; email: string };

// Contacts (with an email) who match the filter. At most 5000 projects are considered.
export async function findCandidates(db: SupabaseClient, f: AudienceFilter): Promise<Candidate[]> {
  let q = db
    .from("projects")
    .select("contact_id, contacts!inner(first_name, last_name, email)")
    .not("contacts.email", "is", null)
    .limit(5000);
  if (f.project_types.length) q = q.in("project_type", f.project_types);
  if (f.materials.length) q = q.in("material_preference", f.materials);
  if (f.stages.length) q = q.in("stage", f.stages);

  const { data, error } = await q;
  if (error) throw error;

  const byContact = new Map<string, Candidate>();
  for (const row of data ?? []) {
    const c = Array.isArray(row.contacts) ? row.contacts[0] : row.contacts;
    if (c?.email && !byContact.has(row.contact_id))
      byContact.set(row.contact_id, {
        contact_id: row.contact_id,
        first_name: c.first_name,
        last_name: c.last_name,
        email: c.email.trim().toLowerCase(),
      });
  }

  if (f.inactive_months && byContact.size) {
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - f.inactive_months);
    const { data: all } = await db
      .from("projects")
      .select("contact_id, created_at")
      .in("contact_id", [...byContact.keys()]);
    const latest = new Map<string, number>();
    for (const p of all ?? [])
      latest.set(p.contact_id, Math.max(latest.get(p.contact_id) ?? 0, new Date(p.created_at).getTime()));
    for (const id of [...byContact.keys()])
      if ((latest.get(id) ?? 0) >= cutoff.getTime()) byContact.delete(id);
  }
  return [...byContact.values()];
}

type ConsentRow = { address_normalized: string; event_type: string; valid_until: string | null };

// Current marketing consent per address. Rows must be newest first; only the latest granted/withdrawn
// event counts, and a grant that has expired no longer counts.
export function consentByAddress(events: ConsentRow[]): Map<string, boolean> {
  const now = Date.now();
  const decided = new Map<string, boolean>();
  for (const e of events) {
    if (decided.has(e.address_normalized)) continue;
    const expired = !!e.valid_until && new Date(e.valid_until).getTime() <= now;
    decided.set(e.address_normalized, e.event_type === "granted" && !expired);
  }
  return decided;
}

export type Eligibility = { eligible: Candidate[]; noConsent: number; suppressed: number };

// Marketing eligibility, derived per address from evidence: the latest granted/withdrawn consent event
// must be "granted" and unexpired, and there must be no active marketing or all_outbound suppression.
export async function checkEligibility(db: SupabaseClient, candidates: Candidate[]): Promise<Eligibility> {
  if (candidates.length === 0) return { eligible: [], noConsent: 0, suppressed: 0 };
  const emails = [...new Set(candidates.map((c) => c.email))];

  const [{ data: consent }, { data: supp }] = await Promise.all([
    db
      .from("consent_events")
      .select("address_normalized, event_type, valid_until, occurred_at")
      .eq("channel", "email")
      .eq("purpose", "marketing")
      .in("address_normalized", emails)
      .in("event_type", ["granted", "withdrawn"])
      .order("occurred_at", { ascending: false }),
    db
      .from("suppressions")
      .select("address_normalized")
      .eq("channel", "email")
      .is("cleared_at", null)
      .in("scope", ["marketing", "all_outbound"])
      .in("address_normalized", emails),
  ]);

  const decided = consentByAddress(consent ?? []);
  const blocked = new Set((supp ?? []).map((s) => s.address_normalized));

  let noConsent = 0;
  let suppressed = 0;
  const eligible: Candidate[] = [];
  for (const c of candidates) {
    if (blocked.has(c.email)) suppressed++;
    else if (!decided.get(c.email)) noConsent++;
    else eligible.push(c);
  }
  return { eligible, noConsent, suppressed };
}
