import type { SupabaseClient } from "@supabase/supabase-js";
import { replyToAddress } from "./reply-to";
import { sendEmail } from "./resend";

export type RecordedEmailResult =
  | { status: "sent"; providerId: string; messageId: string }
  | { status: "skipped"; reason: string }
  | { status: "failed"; code: string };

// The database's demo-mode guard refuses delivery to non-allowlisted recipients. We check the same
// rule first so we skip cleanly instead of creating a message that can never be delivered.
export async function allowedByDemoMode(db: SupabaseClient, email: string) {
  const { data } = await db.from("settings").select("value").eq("key", "demo_mode").maybeSingle();
  if (!data) return false; // no demo_mode row: the database refuses all delivery
  const v = data.value as { enabled: boolean; recipient_allowlist: string[] };
  return !v.enabled || v.recipient_allowlist.includes(email.trim().toLowerCase());
}

type SendArgs = {
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
  attachments?: { filename: string; content: Buffer; contentType?: string }[];
  // Runs after the message exists and before any delivery attempt (the database fixes attachments before then).
  beforeDelivery?: (messageId: string) => Promise<void>;
};

// What really happened, for callers that must report it exactly (see sendRecordedEmailDetailed).
export type DetailedEmailResult =
  // The provider accepted the email. `recorded` is false when the delivery record could not be updated afterwards.
  | { status: "sent"; providerId: string; messageId: string; recorded: boolean }
  | { status: "skipped"; reason: string }
  // The provider definitively refused it (a 4xx answer). Nothing was sent.
  | { status: "rejected"; code: string; recorded: boolean }
  // No definite answer (timeout, network error, provider 5xx). It may or may not have been sent; the delivery stays "queued".
  | { status: "uncertain"; code: string; messageId: string }
  // This exact attempt (idempotency key) was already recorded.
  | { status: "duplicate" }
  | { status: "no_reply_to" };

// Runs a write, retrying once. A thrown error counts as a failed write.
async function persisted(write: () => PromiseLike<{ error: unknown }>): Promise<boolean> {
  for (let i = 0; i < 2; i++) {
    try {
      if (!(await write()).error) return true;
    } catch {
      /* try once more */
    }
  }
  return false;
}

async function deliver(a: SendArgs, strict: boolean): Promise<DetailedEmailResult> {
  const { db, mail } = a;
  const to = a.to.trim().toLowerCase();

  if (!(await allowedByDemoMode(db, to)))
    return { status: "skipped", reason: "Recipient is not on the demo-mode allowlist" };

  // Never send customer email that invites a reply without a monitored Reply-To: nothing is recorded or delivered.
  const replyTo = a.replyTo ?? replyToAddress();
  if (!replyTo) return { status: "no_reply_to" };

  // Strict mode: an attempt that was already recorded is reported, not repeated, and no orphan message is created.
  if (strict) {
    const dup = await db.from("message_deliveries").select("id").eq("idempotency_key", a.idempotencyKey).maybeSingle();
    if (dup.data) return { status: "duplicate" };
  }

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
  await a.beforeDelivery?.(msg.data.id as string);

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
  if (delivery.error) {
    if (strict && delivery.error.code === "23505") return { status: "duplicate" }; // a concurrent request recorded it first
    throw delivery.error;
  }

  const sent = await sendEmail({
    to: [to],
    ...mail,
    idempotencyKey: a.idempotencyKey,
    headers: a.headers,
    replyTo,
    attachments: a.attachments,
  });
  const now = new Date().toISOString();

  if (!sent.ok) {
    // An answer that is not a definite refusal leaves the delivery "queued" (honest: unknown) in strict mode.
    if (strict && sent.ambiguous) return { status: "uncertain", code: sent.code, messageId: msg.data.id as string };
    const upd = () =>
      db.from("message_deliveries").update({ status: "failed", failed_at: now, error_code: sent.code, error_summary: sent.summary }).eq("id", delivery.data.id);
    const recorded = strict ? await persisted(upd) : (await upd(), true);
    return { status: "rejected", code: sent.code, recorded };
  }

  const markDelivery = () =>
    db.from("message_deliveries").update({ status: "submitted", accepted_at: now, provider_message_id: sent.providerId }).eq("id", delivery.data.id);
  const markMessage = () => db.from("messages").update({ provider: "resend", provider_message_id: sent.providerId }).eq("id", msg.data.id);
  if (!strict) {
    await markDelivery();
    await markMessage();
    return { status: "sent", providerId: sent.providerId, messageId: msg.data.id as string, recorded: true };
  }
  const recorded = await persisted(markDelivery);
  await persisted(markMessage);
  return { status: "sent", providerId: sent.providerId, messageId: msg.data.id as string, recorded };
}

// Sends one email to a customer and records it: conversation, immutable message, delivery attempt.
export async function sendRecordedEmail(a: SendArgs): Promise<RecordedEmailResult> {
  const r = await deliver(a, false);
  if (r.status === "sent") return { status: "sent", providerId: r.providerId, messageId: r.messageId };
  if (r.status === "skipped") return r;
  return { status: "failed", code: r.status === "rejected" ? r.code : r.status === "no_reply_to" ? "reply_to_not_configured" : r.status };
}

// Same delivery and records, but every outcome is reported exactly instead of being folded into sent/failed:
// refused by the provider, accepted (with whether the records were saved), unknown, or already recorded.
export const sendRecordedEmailDetailed = (a: SendArgs) => deliver(a, true);
