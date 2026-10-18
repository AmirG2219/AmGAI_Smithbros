import type { SupabaseClient } from "@supabase/supabase-js";
import { sendRecordedEmail } from "@/lib/email/record";
import { checkEligibility } from "./audience";
import { buildCampaignEmail } from "./email";

const PAUSE_MS = 600; // stays under the email provider's default rate limit

// Sends an approved campaign, one recipient at a time. Safe to run again: it only touches recipients that
// are still queued, and each send has a fixed idempotency key.
export async function dispatchCampaign(db: SupabaseClient, campaignId: string) {
  const { data: campaign } = await db.from("campaigns").select("status").eq("id", campaignId).single();
  if (campaign?.status !== "sending") return;

  // Approved content only: the database refuses to queue anything else.
  await db.from("campaign_recipients").update({ status: "queued" }).eq("campaign_id", campaignId).eq("status", "draft");

  for (;;) {
    const { data: batch } = await db
      .from("campaign_recipients")
      .select("id, contact_id, email_snapshot, subject, body_text")
      .eq("campaign_id", campaignId)
      .eq("status", "queued")
      .order("created_at", { ascending: true })
      .limit(25);
    if (!batch || batch.length === 0) break;

    for (const r of batch) {
      const skip = (reason: string) =>
        db.from("campaign_recipients").update({ status: "skipped", skip_reason: reason }).eq("id", r.id);

      // Re-check at send time: the address, consent and suppressions may have changed since approval.
      const { data: contact } = await db.from("contacts").select("first_name, last_name, email").eq("id", r.contact_id).single();
      const email = contact?.email?.trim().toLowerCase();
      if (!contact || email !== r.email_snapshot) {
        await skip("Email address changed since approval");
        continue;
      }
      const check = await checkEligibility(db, [
        { contact_id: r.contact_id, first_name: contact.first_name, last_name: contact.last_name, email },
      ]);
      if (check.eligible.length === 0) {
        await skip(check.suppressed ? "Unsubscribed or suppressed" : "No current marketing consent");
        continue;
      }

      const { mail, headers } = buildCampaignEmail({ subject: r.subject, body: r.body_text, recipientId: r.id });
      const result = await sendRecordedEmail({
        db,
        contactId: r.contact_id,
        projectId: null,
        to: email,
        mail,
        headers,
        idempotencyKey: `campaign:${campaignId}:${r.id}`,
        conversationType: "marketing",
        campaignRecipientId: r.id,
      });

      if (result.status === "sent")
        await db.from("campaign_recipients").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", r.id);
      else if (result.status === "skipped") await skip(result.reason);
      else await db.from("campaign_recipients").update({ status: "failed" }).eq("id", r.id);

      await new Promise((res) => setTimeout(res, PAUSE_MS));
    }
  }

  await db.from("campaigns").update({ status: "completed" }).eq("id", campaignId).eq("status", "sending");
}
