// Shape and validation of the website inquiry. Hand-rolled: it is small and has no extra dependency.

export const PROJECT_TYPES = [
  "new_installation",
  "sand_refinish",
  "restoration",
  "commercial",
] as const;
export const MATERIALS = [
  "hardwood",
  "engineered",
  "laminate",
  "vinyl",
  "tile",
  "unsure",
] as const;
export const TIMELINES = ["asap", "1_3_months", "3_6_months", "flexible"] as const;

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
  notes: string | null;
};

const str = (v: unknown, max: number) =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;

export function parseInquiry(
  body: unknown,
): { ok: true; value: Inquiry } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "Invalid request" };
  const b = body as Record<string, unknown>;

  const submission_key = str(b.submission_key, 100);
  const first_name = str(b.first_name, 100);
  const email = str(b.email, 254);
  if (!submission_key) return { ok: false, error: "Missing submission key" };
  if (!first_name) return { ok: false, error: "First name is required" };
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return { ok: false, error: "A valid email is required" };

  const project_type = PROJECT_TYPES.find((x) => x === b.project_type);
  const material = MATERIALS.find((x) => x === b.material);
  const timeline = TIMELINES.find((x) => x === b.timeline);
  if (!project_type) return { ok: false, error: "Choose a project type" };
  if (!material) return { ok: false, error: "Choose a material" };
  if (!timeline) return { ok: false, error: "Choose a timeline" };

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
      last_name: str(b.last_name, 100),
      email,
      phone: str(b.phone, 40),
      city: str(b.city, 100),
      postal_code: str(b.postal_code, 12),
      project_type,
      material,
      square_footage,
      timeline,
      notes: str(b.notes, 2000),
    },
  };
}
