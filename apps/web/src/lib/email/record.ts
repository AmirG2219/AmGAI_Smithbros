import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmail } from "./resend";

export type RecordedEmailResult =
  | { status: "sent"; providerId: string; messageId: string }
  | { status: "skipped"; reason: string }
  | { status: "failed"; code: string };

// The database's demo-mode guard refuses delivery to non-allowlisted recipients. We check the same
// rule first so we skip cleanly instead of creating a message that can never be delivered.
async function allowedByDemoMode(db: SupabaseClient, email: string) {
  const { data } = await db.from("settings").select("value").eq("key", "demo_mode").maybeSingle();
  if (!data) return false; // no demo_mode row: the database refuses all delivery
  const v = data.value as { enabled: boolean; recipient_allowlist: string[] };
  return !v.enabled || v.recipient_allowlist.includes(email.trim().toLowerCase());
}

// Sends one email to a customer and records it: conversation, immutable message, delivery attempt.
export async function sendRecordedEmail(a: {
  db: SupabaseClient;
  contactId: string;
  projectId: string | null;
  to: string;
  mail: { subject: string; html: string; text: string };
  idempotencyKey: string;
  conversationType?: "service" | "marketing";
  campaignRecipientId?: string;
  headers?: Record<string, string>;
  replyTo?: string;
}): Promise<RecordedEmailResult> {
  const { db, mail } = a;
  const to = a.to.trim().toLowerCase();

  if (!(await allowedByDemoMode(db, to)))
    return { status: "skipped", reason: "Recipient is not on the demo-mode allowlist" };

  // Reuse the project's open service email thread, or start one.
  const type = a.conversationType ?? "service";
  let existingQuery = db
    .from("conversations")
    .select("id")
    .eq("contact_id", a.contactId)
    .eq("channel", "email")
    .eq("type", type)
    .eq("status", "open");
  existingQuery = a.projectId
    ? existingQuery.eq("project_id", a.projectId)
    : existingQuery.is("project_id", null);
  const existing = await existingQuery
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  let conversationId = existing.data?.id as string | undefined;
  if (!conversationId) {
    const conv = await db
      .from("conversations")
      .insert({
        contact_id: a.contactId,
        project_id: a.projectId,
        channel: "email",
        type,
        subject: mail.subject,
      })
      .select("id")
      .single();
    if (conv.error) throw conv.error;
    conversationId = conv.data.id as string;
  }

  const msg = await db
    .from("messages")
    .insert({
      conversation_id: conversationId,
      direction: "outbound",
      channel: "email",
      sender_address: (process.env.EMAIL_FROM ?? "").replace(/.*<(.+)>.*/, "$1"),
      recipient_address: to,
      subject: mail.subject,
      body_text: mail.text,
      body_html: mail.html,
      ...(a.campaignRecipientId ? { campaign_recipient_id: a.campaignRecipientId } : {}),
    })
    .select("id")
    .single();
  if (msg.error) throw msg.error;

  const delivery = await db
    .from("message_deliveries")
    .insert({
      message_id: msg.data.id,
      attempt_number: 1,
      provider: "resend",
      status: "queued",
      idempotency_key: a.idempotencyKey,
    })
    .select("id")
    .single();
  if (delivery.error) throw delivery.error;

  const sent = await sendEmail({
    to: [to],
    ...mail,
    idempotencyKey: a.idempotencyKey,
    headers: a.headers,
    replyTo: a.replyTo,
  });
  const now = new Date().toISOString();

  if (!sent.ok) {
    await db
      .from("message_deliveries")
      .update({ status: "failed", failed_at: now, error_code: sent.code, error_summary: sent.summary })
      .eq("id", delivery.data.id);
    return { status: "failed", code: sent.code };
  }

  await db
    .from("message_deliveries")
    .update({ status: "submitted", accepted_at: now, provider_message_id: sent.providerId })
    .eq("id", delivery.data.id);
  await db
    .from("messages")
    .update({ provider: "resend", provider_message_id: sent.providerId })
    .eq("id", msg.data.id);
  return { status: "sent", providerId: sent.providerId, messageId: msg.data.id as string };
}
