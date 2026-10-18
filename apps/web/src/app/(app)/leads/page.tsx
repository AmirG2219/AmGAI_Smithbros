import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const classStyle: Record<string, string> = {
  hot: "bg-gold/30 text-walnut",
  warm: "bg-bronze/25 text-walnut",
  cold: "bg-line text-walnut",
};

export default async function Leads() {
  const supabase = await createClient();
  const { data: leads, error } = await supabase
    .from("projects")
    .select(
      "id, project_type, material_preference, square_footage, site_city, stage, lead_score, lead_classification, review_status, created_at, contacts(first_name, last_name, email)",
    )
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">Leads</h1>
      {error && <p className="text-red-700">Could not load leads.</p>}
      <div className="overflow-x-auto rounded-lg border border-line bg-card">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line text-bronze">
            <tr>
              <th className="p-3">Received</th>
              <th className="p-3">Customer</th>
              <th className="p-3">Project</th>
              <th className="p-3">City</th>
              <th className="p-3">Rating</th>
              <th className="p-3">Stage</th>
            </tr>
          </thead>
          <tbody>
            {(leads ?? []).map((l) => {
              const c = Array.isArray(l.contacts) ? l.contacts[0] : l.contacts;
              return (
                <tr key={l.id} className="border-b border-line last:border-0">
                  <td className="p-3">
                    {new Date(l.created_at).toLocaleDateString()}
                  </td>
                  <td className="p-3">
                    {c?.first_name} {c?.last_name}
                    <div className="text-xs text-bronze">{c?.email}</div>
                  </td>
                  <td className="p-3">
                    {[l.project_type, l.material_preference]
                      .filter(Boolean)
                      .join(" · ") || "—"}
                    {l.square_footage ? ` · ${l.square_footage} sq ft` : ""}
                  </td>
                  <td className="p-3">{l.site_city ?? "—"}</td>
                  <td className="p-3">
                    {l.lead_classification ? (
                      <span
                        className={`rounded px-2 py-0.5 ${classStyle[l.lead_classification]}`}
                      >
                        {l.lead_classification} ({l.lead_score})
                      </span>
                    ) : (
                      <span className="text-bronze">
                        {l.review_status === "needs_review"
                          ? "Needs review"
                          : "Unrated"}
                      </span>
                    )}
                  </td>
                  <td className="p-3">{l.stage.replaceAll("_", " ")}</td>
                </tr>
              );
            })}
            {(leads ?? []).length === 0 && (
              <tr>
                <td colSpan={6} className="p-6 text-center text-bronze">
                  No leads yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
