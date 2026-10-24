import { FastLink } from "./fast-link";
import { Card, Pill, td, th } from "./ui";

type Contact = { first_name: string; last_name: string | null; email: string | null };

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
  contacts: Contact | Contact[] | null;
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

const contactOf = (l: LeadRow) => (Array.isArray(l.contacts) ? l.contacts[0] : l.contacts);
const projectLine = (l: LeadRow) =>
  [l.project_type?.replaceAll("_", " "), l.material_preference].filter(Boolean).join(" · ") || "—";
const dateLabel = (iso: string) =>
  new Date(iso).toLocaleDateString("en-CA", { month: "short", day: "numeric" });

function Rating({ l }: { l: LeadRow }) {
  if (l.lead_classification)
    return (
      <Pill kind={l.lead_classification}>
        {l.lead_classification[0].toUpperCase() + l.lead_classification.slice(1)} · {l.lead_score}
      </Pill>
    );
  return (
    <Pill kind="review">{l.review_status === "needs_review" ? "Needs review" : "Unrated"}</Pill>
  );
}

export function LeadsTable({ leads }: { leads: LeadRow[] }) {
  if (leads.length === 0)
    return (
      <Card className="px-6 py-10 text-center text-sm text-muted">No leads yet.</Card>
    );

  return (
    <>
      {/* Phones: one card per lead */}
      <div className="flex flex-col gap-3 md:hidden">
        {leads.map((l) => {
          const c = contactOf(l);
          return (
            <Card key={l.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <FastLink href={`/leads/${l.id}`} className="block truncate font-medium hover:text-bronze">
                    {c?.first_name} {c?.last_name}
                  </FastLink>
                  <p className="truncate text-xs text-muted">{c?.email}</p>
                </div>
                <Rating l={l} />
              </div>
              <p className="mt-3 text-sm capitalize">{projectLine(l)}</p>
              <p className="mt-1 font-serif text-xl">{estimateLabel(l)}</p>
              <p className="mt-2 text-xs capitalize text-muted">
                {l.stage.replaceAll("_", " ")} · {l.site_city ?? "—"} · {dateLabel(l.created_at)}
              </p>
            </Card>
          );
        })}
      </div>

      {/* Tablet and desktop: table */}
      <Card className="hidden overflow-x-auto md:block">
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
              const c = contactOf(l);
              return (
                <tr key={l.id} className="border-b border-line transition-colors duration-150 last:border-0 hover:bg-cream/60">
                  <td className={td}>
                    <FastLink href={`/leads/${l.id}`} className="font-medium hover:text-bronze">
                      {c?.first_name} {c?.last_name}
                    </FastLink>
                    <div className="text-xs text-muted">{c?.email}</div>
                  </td>
                  <td className={`${td} capitalize`}>
                    {projectLine(l)}
                    {l.square_footage && (
                      <div className="text-xs normal-case text-muted">{l.square_footage} sq ft</div>
                    )}
                  </td>
                  <td className={`${td} text-muted`}>{l.site_city ?? "—"}</td>
                  <td className={`${td} whitespace-nowrap`}>{estimateLabel(l)}</td>
                  <td className={td}>
                    <Rating l={l} />
                  </td>
                  <td className={`${td} capitalize`}>{l.stage.replaceAll("_", " ")}</td>
                  <td className={`${td} text-muted`}>{dateLabel(l.created_at)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </>
  );
}
