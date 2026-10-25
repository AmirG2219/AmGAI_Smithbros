export type Status = "draft" | "generated" | "sent" | "returned" | "verified" | "superseded" | "cancelled";

export const STATUS: Record<string, { label: string; tone: string }> = {
  draft: { label: "Draft", tone: "bg-stone-100 text-stone-600" },
  generated: { label: "Ready to send", tone: "bg-sky-50 text-sky-700" },
  sent: { label: "Awaiting return", tone: "bg-amber-50 text-amber-700" },
  returned: { label: "Signed copy received", tone: "bg-violet-50 text-violet-700" },
  verified: { label: "Verified", tone: "bg-emerald-50 text-emerald-700" },
  superseded: { label: "Superseded", tone: "bg-stone-100 text-stone-500" },
  cancelled: { label: "Cancelled", tone: "bg-red-50 text-red-700" },
};

// Dashboard tabs. "all" hides retired documents (superseded and cancelled).
export const TABS = [
  { key: "all", label: "All", statuses: ["draft", "generated", "sent", "returned", "verified"] },
  { key: "drafts", label: "Drafts", statuses: ["draft", "generated"] },
  { key: "awaiting", label: "Awaiting return", statuses: ["sent"] },
  { key: "review", label: "To verify", statuses: ["returned"] },
  { key: "verified", label: "Verified", statuses: ["verified"] },
  { key: "archived", label: "Archived", statuses: ["superseded", "cancelled"] },
] as const;

export const fmtDate = (iso: string | null | undefined, long = false) =>
  iso
    ? new Date(iso).toLocaleDateString("en-CA", {
        timeZone: "America/Edmonton",
        month: "short",
        day: "numeric",
        year: "numeric",
        ...(long ? { hour: "numeric", minute: "2-digit" } : {}),
      })
    : "—";

export const pretty = (s: string | null | undefined) => (s ? s.replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase()) : "Project");
