// Shape and validation of the website inquiry. Hand-rolled: it is small and has no extra dependency.

export const PROJECT_TYPES = ["new_installation", "sand_refinish", "restoration", "commercial"] as const;
export const MATERIALS = ["hardwood", "engineered", "laminate", "vinyl", "tile", "unsure"] as const;
// "asap" is shown as "Within 1 month" and "flexible" as "Just exploring"
export const TIMELINES = ["asap", "1_3_months", "3_6_months", "flexible"] as const;
export const ROOMS = ["living_room", "bedroom", "kitchen", "hallway", "basement", "stairs", "commercial", "other"] as const;
export const SPECIES = ["white_oak", "red_oak", "maple", "walnut", "birch", "hickory", "cherry"] as const;
export const PATTERNS = ["straight_plank", "herringbone", "chevron", "show_all"] as const;
export const FINISHES = ["site_finished", "pre_finished", "no_preference"] as const;
export const CONTACT_METHODS = ["phone", "text", "email"] as const;

export type Inquiry = {
  submission_key: string;
  first_name: string;
  last_name: string | null;
  email: string;
  phone: string | null;
  city: string | null;
  postal_code: string | null;
  project_type: (typeof PROJECT_TYPES)[number];
  material: (typeof MATERIALS)[number];
  square_footage: number | null;
  timeline: (typeof TIMELINES)[number];
  rooms: (typeof ROOMS)[number][];
  species: (typeof SPECIES)[number][];
  pattern: (typeof PATTERNS)[number] | null;
  finish: (typeof FINISHES)[number] | null;
  preferred_contact: (typeof CONTACT_METHODS)[number] | null;
  notes: string | null;
};

const str = (v: unknown, max: number) =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;

// Keeps only values from the allowed list, so the form can never store arbitrary text in these fields.
const pickMany = <T extends readonly string[]>(v: unknown, allowed: T): T[number][] =>
  (Array.isArray(v) ? v : []).filter((x): x is T[number] => typeof x === "string" && (allowed as readonly string[]).includes(x));
const pickOne = <T extends readonly string[]>(v: unknown, allowed: T): T[number] | null =>
  typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T[number]) : null;

export function parseInquiry(
  body: unknown,
): { ok: true; value: Inquiry } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "Invalid request" };
  const b = body as Record<string, unknown>;

  const submission_key = str(b.submission_key, 100);
  if (!submission_key) return { ok: false, error: "Missing submission key" };

  // Either first_name/last_name, or a single full_name that we split.
  let first_name = str(b.first_name, 100);
  let last_name = str(b.last_name, 100);
  const full = str(b.full_name, 200);
  if (!first_name && full) {
    const parts = full.split(/\s+/);
    first_name = parts[0];
    last_name = parts.slice(1).join(" ") || null;
  }
  if (!first_name) return { ok: false, error: "Please enter your name" };

  const email = str(b.email, 254);
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: "A valid email is required" };

  const project_type = pickOne(b.project_type, PROJECT_TYPES);
  const timeline = pickOne(b.timeline, TIMELINES);
  if (!project_type) return { ok: false, error: "Choose a project type" };
  if (!timeline) return { ok: false, error: "Choose when you'd like to start" };
  // Smith Bros works in hardwood, so the website form does not ask for a material.
  const material = pickOne(b.material, MATERIALS) ?? "hardwood";

  let square_footage: number | null = null;
  if (b.square_footage !== undefined && b.square_footage !== "" && b.square_footage !== null) {
    const n = Number(b.square_footage);
    if (!Number.isFinite(n) || n <= 0 || n > 1_000_000)
      return { ok: false, error: "Square footage must be a positive number" };
    square_footage = Math.round(n * 100) / 100;
  }

  return {
    ok: true,
    value: {
      submission_key,
      first_name,
      last_name,
      email,
      phone: str(b.phone, 40),
      city: str(b.city, 100),
      postal_code: str(b.postal_code, 12),
      project_type,
      material,
      square_footage,
      timeline,
      rooms: pickMany(b.rooms, ROOMS),
      species: pickMany(b.species, SPECIES),
      pattern: pickOne(b.pattern, PATTERNS),
      finish: pickOne(b.finish, FINISHES),
      preferred_contact: pickOne(b.preferred_contact, CONTACT_METHODS),
      notes: str(b.notes, 2000),
    },
  };
}

// Plain-English labels for the stored values (used in the dashboard and emails).
export const LABELS: Record<string, string> = {
  asap: "Within 1 month",
  "1_3_months": "1–3 months",
  "3_6_months": "3–6 months",
  flexible: "Just exploring",
  new_installation: "New installation",
  sand_refinish: "Sand & refinish",
  restoration: "Restoration / repair",
  commercial: "Commercial project",
  living_room: "Living room",
  white_oak: "White oak",
  red_oak: "Red oak",
  straight_plank: "Straight plank",
  show_all: "Show me everything",
  site_finished: "Site-finished",
  pre_finished: "Pre-finished",
  no_preference: "No preference",
  phone: "Phone call",
  text: "Text message",
  email: "Email",
};
export const label = (v: string) => LABELS[v] ?? v.replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase());
