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
      <PageHeader eyebrow="Marketing" title="Marketing Emails">
        <Link
          href="/campaigns/new"
          className="inline-flex items-center gap-2 rounded-lg bg-walnut px-4 py-2.5 text-sm font-medium text-cream hover:bg-bronze"
        >
          <Plus size={16} /> New campaign
        </Link>
      </PageHeader>

      <Card className="mb-6 p-5">
        <p className="eyebrow mb-3">How campaigns work</p>
        <ol className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["1. Describe it", "Say who you want to reach and why. AI can write the first draft, or you write it yourself."],
            ["2. Preview", "See how many people match, who is left out, and a sample email. Nothing is saved yet."],
            ["3. Review and approve", "Create the draft, check it, then approve the exact wording. Once approved it can't be changed."],
            ["4. Send", "Only people who gave permission get it, and each email has an unsubscribe link."],
          ].map(([t, d]) => (
            <li key={t}>
              <p className="font-medium">{t}</p>
              <p className="mt-1 text-muted">{d}</p>
            </li>
          ))}
        </ol>
        <p className="mt-4 text-xs text-muted">
          Anyone who has not agreed to marketing email, or who has unsubscribed, is
          never emailed, even if they match the audience.
        </p>
      </Card>

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
