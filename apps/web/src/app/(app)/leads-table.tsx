import { Card, Pill, td, th } from "./ui";

export type LeadRow = {
  id: string;
  project_type: string | null;
  material_preference: string | null;
  square_footage: number | null;
  site_city: string | null;
  stage: string;
  lead_score: number | null;
  lead_classification: string | null;
  review_status: string;
  created_at: string;
  estimates: {
    revision_number: number;
    status: string;
    price_min: number | null;
    price_max: number | null;
  }[];
  contacts:
    | { first_name: string; last_name: string | null; email: string | null }
    | { first_name: string; last_name: string | null; email: string | null }[]
    | null;
};

export const LEAD_COLUMNS =
  "id, project_type, material_preference, square_footage, site_city, stage, lead_score, lead_classification, review_status, created_at, contacts(first_name, last_name, email), estimates(revision_number, status, price_min, price_max)";

const money = (n: number) =>
  n.toLocaleString("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 });

function estimateLabel(l: LeadRow) {
  const e = [...(l.estimates ?? [])]
    .filter((x) => x.status !== "cancelled")
    .sort((a, b) => b.revision_number - a.revision_number)[0];
  if (!e) return "—";
  if (e.price_min === null || e.price_max === null) return "Needs quote";
  return `${money(e.price_min)} – ${money(e.price_max)}`;
}

export function LeadsTable({ leads }: { leads: LeadRow[] }) {
  return (
    <Card className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-line">
          <tr>
            <th className={th}>Client</th>
            <th className={th}>Project</th>
            <th className={th}>Area</th>
            <th className={th}>Estimate</th>
            <th className={th}>Rating</th>
            <th className={th}>Stage</th>
            <th className={th}>Received</th>
          </tr>
        </thead>
        <tbody>
          {leads.map((l) => {
            const c = Array.isArray(l.contacts) ? l.contacts[0] : l.contacts;
            return (
              <tr key={l.id} className="border-b border-line last:border-0">
                <td className={td}>
                  <div className="font-medium">
                    {c?.first_name} {c?.last_name}
                  </div>
                  <div className="text-xs text-muted">{c?.email}</div>
                </td>
                <td className={td}>
                  {[l.project_type, l.material_preference]
                    .filter(Boolean)
                    .join(" · ") || "—"}
                  {l.square_footage && (
                    <div className="text-xs text-muted">
                      {l.square_footage} sq ft
                    </div>
                  )}
                </td>
                <td className={`${td} text-muted`}>{l.site_city ?? "—"}</td>
                <td className={`${td} whitespace-nowrap`}>{estimateLabel(l)}</td>
                <td className={td}>
                  {l.lead_classification ? (
                    <Pill kind={l.lead_classification}>
                      {l.lead_classification[0].toUpperCase() +
                        l.lead_classification.slice(1)}{" "}
                      · {l.lead_score}
                    </Pill>
                  ) : (
                    <Pill kind="review">
                      {l.review_status === "needs_review"
                        ? "Needs review"
                        : "Unrated"}
                    </Pill>
                  )}
                </td>
                <td className={`${td} capitalize`}>
                  {l.stage.replaceAll("_", " ")}
                </td>
                <td className={`${td} text-muted`}>
                  {new Date(l.created_at).toLocaleDateString("en-CA", {
                    month: "short",
                    day: "numeric",
                  })}
                </td>
              </tr>
            );
          })}
          {leads.length === 0 && (
            <tr>
              <td colSpan={7} className="px-6 py-10 text-center text-muted">
                No leads yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </Card>
  );
}
