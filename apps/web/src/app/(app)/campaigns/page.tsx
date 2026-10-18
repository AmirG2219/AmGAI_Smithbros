import Link from "next/link";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Card, PageHeader, Pill } from "../ui";

export default async function Campaigns() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("campaigns")
    .select("id, name, status, created_at, campaign_recipients(status)")
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <div>
      <PageHeader eyebrow="System 2" title="Email campaigns">
        <Link
          href="/campaigns/new"
          className="inline-flex items-center gap-2 rounded-lg bg-walnut px-4 py-2.5 text-sm font-medium text-cream hover:bg-bronze"
        >
          <Plus size={16} /> New campaign
        </Link>
      </PageHeader>

      {(data ?? []).length === 0 ? (
        <Card className="px-6 py-10 text-center text-sm text-muted">No campaigns yet.</Card>
      ) : (
        <div className="grid gap-3">
          {(data ?? []).map((c) => {
            const r = (c.campaign_recipients ?? []) as { status: string }[];
            const sent = r.filter((x) => x.status === "sent").length;
            return (
              <Link key={c.id} href={`/campaigns/${c.id}`}>
                <Card className="flex flex-wrap items-center justify-between gap-3 p-4 hover:border-bronze sm:p-5">
                  <div className="min-w-0">
                    <p className="font-medium">{c.name}</p>
                    <p className="text-sm text-muted">
                      {r.length} recipients · {sent} sent ·{" "}
                      {new Date(c.created_at).toLocaleDateString("en-CA", { month: "short", day: "numeric" })}
                    </p>
                  </div>
                  <Pill kind="review">{c.status.replaceAll("_", " ")}</Pill>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
