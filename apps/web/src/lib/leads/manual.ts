// Validation for a lead entered by staff (phone call, walk-in, email...). Pure, so it can be tested without a database.
// Only the lead source is required (plus a customer); everything else is optional and never invented.
import { PROJECT_TYPES, TIMELINES, type Inquiry } from "./inquiry";

export const LEAD_SOURCES = ["phone", "walk_in", "email", "referral", "other"] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

export type ManualLead = {
  lead_source: LeadSource;
  project_type: Inquiry["project_type"] | null;
  square_footage: number | null;
  timeline: Inquiry["timeline"] | null;
  site_address_line1: string | null;
  site_city: string | null;
  site_postal_code: string | null;
  notes: string | null;
};

const clean = (v: unknown, max: number) => {
  const s = String(v ?? "").trim().slice(0, max);
  return s || null;
};

export function parseManualLead(i: Record<string, unknown>): { ok: true; value: ManualLead } | { ok: false; error: string } {
  const lead_source = String(i.lead_source ?? "");
  if (!(LEAD_SOURCES as readonly string[]).includes(lead_source)) return { ok: false, error: "Choose how this inquiry came in." };

  const type = String(i.project_type ?? "");
  if (type && !(PROJECT_TYPES as readonly string[]).includes(type)) return { ok: false, error: "That project type isn't recognised." };
  const timeline = String(i.timeline ?? "");
  if (timeline && !(TIMELINES as readonly string[]).includes(timeline)) return { ok: false, error: "That timeline isn't recognised." };

  let square_footage: number | null = null;
  const sq = String(i.square_footage ?? "").trim();
  if (sq) {
    const n = Number(sq);
    if (!Number.isFinite(n) || n <= 0 || n > 1_000_000) return { ok: false, error: "Square footage must be a positive number." };
    square_footage = Math.round(n * 100) / 100;
  }

  return {
    ok: true,
    value: {
      lead_source: lead_source as LeadSource,
      project_type: (type || null) as ManualLead["project_type"],
      square_footage,
      timeline: (timeline || null) as ManualLead["timeline"],
      site_address_line1: clean(i.site_address_line1, 200),
      site_city: clean(i.site_city, 100),
      site_postal_code: clean(i.site_postal_code, 12),
      notes: clean(i.notes, 2000),
    },
  };
}

// What staff still need to find out. These are flagged for review instead of being filled with guesses.
export function missingDetails(
  l: { project_type: string | null; square_footage: number | null; timeline: string | null; site_address_line1: string | null },
  hasContactMethod: boolean,
): string[] {
  return [
    !hasContactMethod && "a phone number or email",
    !l.project_type && "project type",
    l.square_footage === null && "square footage",
    !l.timeline && "timeline",
    !l.site_address_line1 && "job site address",
  ].filter((x): x is string => !!x);
}

export function reviewReason(sourceLabel: string, missing: string[], contactDiffers: boolean): string | null {
  const parts = [
    missing.length ? `Added by staff (${sourceLabel}). Still needed: ${missing.join(", ")}.` : null,
    contactDiffers
      ? "The name or phone entered differs from the existing customer with this email. The customer record was not changed."
      : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" ") : null;
}
