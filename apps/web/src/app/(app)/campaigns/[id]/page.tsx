import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { emailEnabled } from "@/lib/email/resend";
import { createClient } from "@/lib/supabase/server";
import { Card, PageHeader, Pill } from "../../ui";
import { approveCampaign, cancelCampaign, sendCampaign, submitForReview } from "../actions";

const notices: Record<string, string> = {
  created: "Campaign draft created with a frozen copy of each person's email.",
  review: "Submitted for review.",
  approved: "Approved. Nothing has been sent yet.",
  cancelled: "Campaign cancelled.",
  sending: "Sending has started. Refresh this page to follow progress.",
  invalid: "That action isn't available in the campaign's current state.",
  "email-off": "Email sending is off. Set EMAIL_SENDING_ENABLED, RESEND_API_KEY and EMAIL_FROM first.",
  "address-needed": "Add COMPANY_ADDRESS (Smith Bros' mailing address) to the environment first. Marketing emails must carry it.",
};

const btn = "rounded-lg px-5 py-2.5 text-sm font-medium";

export default async function CampaignDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ notice?: string }>;
}) {
  const { id } = await params;
  const { notice } = await searchParams;
  const supabase = await createClient();

  const { data: c } = await supabase
    .from("campaigns")
    .select("id, name, status, instruction_text, audience_filter, approved_at, created_at")
    .eq("id", id)
    .maybeSingle();
  if (!c) notFound();

  const { data: recipients } = await supabase
    .from("campaign_recipients")
    .select("id, email_snapshot, status, skip_reason, contacts(first_name, last_name)")
    .eq("campaign_id", id)
    .order("created_at", { ascending: true })
    .limit(500);

  const rows = recipients ?? [];
  const count = (s: string) => rows.filter((r) => r.status === s).length;
  const tpl = (c.audience_filter as { template?: { subject: string; body: string } }).template;

  const approve = approveCampaign.bind(null, id);
  const review = submitForReview.bind(null, id);
  const cancel = cancelCampaign.bind(null, id);
  const send = sendCampaign.bind(null, id);

  return (
    <div>
      <Link href="/campaigns" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-walnut">
        <ArrowLeft size={14} /> All campaigns
      </Link>
      <PageHeader eyebrow="Campaign" title={c.name}>
        <Pill kind="review">{c.status.replaceAll("_", " ")}</Pill>
      </PageHeader>

      {notice && notices[notice] && (
        <p className="mb-5 rounded-xl border border-gold/40 bg-gold/10 px-4 py-3 text-sm">{notices[notice]}</p>
      )}
      {!emailEnabled() && (
        <p className="mb-5 rounded-xl border border-line bg-card px-4 py-3 text-sm text-muted">
          Email sending is off in this environment, so approving works but sending won&apos;t start.
        </p>
      )}

      <div className="grid max-w-3xl gap-5">
        <Card className="p-5">
          <p className="eyebrow mb-2">Goal</p>
          <p className="text-sm">{c.instruction_text}</p>
        </Card>

        {tpl && (
          <Card className="p-5">
            <p className="eyebrow mb-2">Email</p>
            <p className="mb-2 font-medium">{tpl.subject}</p>
            <pre className="whitespace-pre-wrap font-sans text-sm">{tpl.body}</pre>
          </Card>
        )}

        <Card className="p-5">
          <p className="eyebrow mb-3">Recipients</p>
          <div className="mb-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            {[
              ["Total", rows.length],
              ["Sent", count("sent")],
              ["Skipped", count("skipped")],
              ["Failed", count("failed")],
            ].map(([k, n]) => (
              <div key={k as string}>
                <p className="font-serif text-3xl">{n}</p>
                <p className="text-muted">{k}</p>
              </div>
            ))}
          </div>
          <ul className="divide-y divide-line text-sm">
            {rows.slice(0, 50).map((r) => {
              const ct = Array.isArray(r.contacts) ? r.contacts[0] : r.contacts;
              return (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>
                    {ct?.first_name} {ct?.last_name} <span className="text-muted">· {r.email_snapshot}</span>
                  </span>
                  <span className="text-xs capitalize text-muted">
                    {r.status}
                    {r.skip_reason ? `: ${r.skip_reason}` : ""}
                  </span>
                </li>
              );
            })}
          </ul>
          {rows.length > 50 && <p className="mt-2 text-xs text-muted">Showing the first 50 of {rows.length}.</p>}
        </Card>

        <div className="flex flex-wrap gap-3">
          {c.status === "draft" && (
            <form action={review}>
              <button className={`${btn} bg-walnut text-cream hover:bg-bronze`}>Submit for review</button>
            </form>
          )}
          {c.status === "ready_for_review" && (
            <form action={approve}>
              <button className={`${btn} bg-walnut text-cream hover:bg-bronze`}>Approve this exact content</button>
            </form>
          )}
          {(c.status === "approved" || c.status === "sending") && (
            <form action={send}>
              <button className={`${btn} bg-walnut text-cream hover:bg-bronze`}>
                {c.status === "sending" ? "Resume sending" : "Send now"}
              </button>
            </form>
          )}
          {["draft", "ready_for_review", "approved"].includes(c.status) && (
            <form action={cancel}>
              <button className={`${btn} border border-line hover:border-bronze`}>Cancel campaign</button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
