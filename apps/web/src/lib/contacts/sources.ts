// How a client ended up in the system. "website_intake" and "manual" are what the app already writes.
export const SOURCE_LABELS: Record<string, string> = {
  website_intake: "Website form",
  manual: "Added manually",
  phone: "Phone call",
  referral: "Referral",
  walk_in: "Walk-in",
  spreadsheet: "Spreadsheet import",
  other: "Other",
};

// Choices offered when staff add a client by hand.
export const MANUAL_SOURCES = ["manual", "phone", "referral", "walk_in", "other"] as const;

export const sourceLabel = (s: string | null) => (s && SOURCE_LABELS[s]) || (s ? s.replaceAll("_", " ") : "Unknown");
