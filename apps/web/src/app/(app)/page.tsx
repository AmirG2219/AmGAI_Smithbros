import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function Overview() {
  const supabase = await createClient();
  const count = (q: PromiseLike<{ count: number | null }>) =>
    q.then((r) => r.count ?? 0);

  const [newLeads, needsReview, hot, booked] = await Promise.all([
    count(
      supabase
        .from("projects")
        .select("id", { count: "exact", head: true })
        .eq("stage", "new"),
    ),
    count(
      supabase
        .from("projects")
        .select("id", { count: "exact", head: true })
        .eq("review_status", "needs_review"),
    ),
    count(
      supabase
        .from("projects")
        .select("id", { count: "exact", head: true })
        .eq("lead_classification", "hot"),
    ),
    count(
      supabase
        .from("appointments")
        .select("id", { count: "exact", head: true })
        .eq("status", "scheduled"),
    ),
  ]);

  const tiles = [
    { label: "New leads", value: newLeads },
    { label: "Needs review", value: needsReview },
    { label: "Hot leads", value: hot },
    { label: "Consultations booked", value: booked },
  ];

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">Overview</h1>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {tiles.map((t) => (
          <div
            key={t.label}
            className="rounded-lg border border-line bg-card p-5"
          >
            <p className="text-sm text-bronze">{t.label}</p>
            <p className="mt-2 text-3xl font-semibold">{t.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
