import type { SupabaseClient } from "@supabase/supabase-js";
import { emailEnabled, sendEmail } from "@/lib/email/resend";
import { customerEstimateEmail, staffAlertEmail } from "@/lib/email/templates";
import type { Inquiry } from "./inquiry";

export type NotifyContext = {
  db: SupabaseClient;
  projectId: string;
  q: Inquiry;
  score: { score: number; classification: string } | null;
  estimate: {
    id: string;
    priced: boolean;
    min?: number;
    max?: number;
    isSample: boolean;
  } | null;
};

const appUrl = () => (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");

// Mirrors the database's demo-mode send guard so we skip cleanly instead of creating a message
// that can never be delivered. The database remains the final authority.
async function allowedByDemoMode(db: SupabaseClient, email: string) {
  const { data } = await db.from("settings").select("value").eq("key", "demo_mode").maybeSingle();
  if (!data) return false; // no demo_mode row: the database refuses all delivery
  const v = data.value as { enabled: boolean; recipient_allowlist: string[] };
  return !v.enabled || v.recipient_allowlist.includes(email.trim().toLowerCase());
}

export async function notifyNewLead(ctx: NotifyContext) {
  if (!emailEnabled()) {
    console.info("[notify] email sending is off (EMAIL_SENDING_ENABLED / RESEND_API_KEY / EMAIL_FROM); skipped");
    return;
  }
  // Independent: a failed staff alert must not block the customer email, and vice versa.
  const results = await Promise.allSettled([staffAlert(ctx), customerEstimate(ctx)]);
  for (const r of results)
    if (r.status === "rejected") console.error("[notify] failed:", r.reason);
}

async function staffAlert({ q, score, estimate, projectId }: NotifyContext) {
  const to = (process.env.ALERT_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (to.length === 0) return;

  const mail = staffAlertEmail({
    name: [q.first_name, q.last_name].filter(Boolean).join(" "),
    email: q.email,
    phone: q.phone,
    city: q.city,
    projectType: q.project_type,
    material: q.material,
    squareFootage: q.square_footage,
    timeline: q.timeline,
    notes: q.notes,
    score: score?.score ?? null,
    classification: score?.classification ?? null,
    estimate:
      estimate?.priced && estimate.min !== undefined && estimate.max !== undefined
        ? { min: estimate.min, max: estimate.max, isSample: estimate.isSample }
        : null,
    dashboardUrl: `${appUrl()}/leads`,
  });
  const r = await sendEmail({ to, ...mail, idempotencyKey: `staff-alert:${projectId}` });
  if (!r.ok) console.error(`[notify] staff alert failed (${r.code}): ${r.summary}`);
}

async function customerEstimate({ db, projectId, q, estimate }: NotifyContext) {
  // Only priced estimates are sent automatically; unpriced ones wait for a staff quote.
  if (!estimate?.priced || estimate.min === undefined || estimate.max === undefined) return;

  const { data: project } = await db
    .from("projects")
    .select("contact_id")
    .eq("id", projectId)
    .single();
  if (!project) throw new Error("project not found");
  const contactId = project.contact_id as string;

  const event = (event_type: string, summary: string, details: object = {}) =>
    db.from("events").insert({
      contact_id: contactId,
      project_id: projectId,
      event_type,
      summary,
      details,
      source: "email",
    });

  if (!(await allowedByDemoMode(db, q.email))) {
    await event(
      "estimate.send_skipped",
      "Estimate not emailed: recipient is not on the demo-mode allowlist",
    );
    return;
  }

  // draft -> approved (rule-based automatic approval; no human approver)
  const approve = await db
    .from("estimates")
    .update({ status: "approved", approved_at: new Date().toISOString() })
    .eq("id", estimate.id)
    .eq("status", "draft");
  if (approve.error) throw approve.error;

  const mail = customerEstimateEmail({
    firstName: q.first_name,
    projectType: q.project_type,
    material: q.material,
    squareFootage: q.square_footage,
    min: estimate.min,
    max: estimate.max,
    isSample: estimate.isSample,
    bookingUrl: process.env.CALENDLY_URL || null,
  });

  // Record the conversation, the immutable message, and the delivery attempt before sending.
  const conv = await db
    .from("conversations")
    .insert({
      contact_id: contactId,
      project_id: projectId,
      channel: "email",
      type: "service",
      subject: mail.subject,
    })
    .select("id")
    .single();
  if (conv.error) throw conv.error;

  const msg = await db
    .from("messages")
    .insert({
      conversation_id: conv.data.id,
      direction: "outbound",
      channel: "email",
      sender_address: (process.env.EMAIL_FROM ?? "").replace(/.*<(.+)>.*/, "$1"),
      recipient_address: q.email.trim().toLowerCase(),
      subject: mail.subject,
      body_text: mail.text,
      body_html: mail.html,
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
      idempotency_key: `estimate-email:${estimate.id}:1`,
    })
    .select("id")
    .single();
  if (delivery.error) throw delivery.error;

  const sent = await sendEmail({
    to: [q.email.trim().toLowerCase()],
    ...mail,
    idempotencyKey: `estimate-email:${estimate.id}:1`,
  });

  const now = new Date().toISOString();
  if (!sent.ok) {
    await db
      .from("message_deliveries")
      .update({
        status: "failed",
        failed_at: now,
        error_code: sent.code,
        error_summary: sent.summary,
      })
      .eq("id", delivery.data.id);
    await event("estimate.send_failed", "Estimate email could not be sent", { code: sent.code });
    return;
  }

  await db
    .from("message_deliveries")
    .update({ status: "submitted", accepted_at: now, provider_message_id: sent.providerId })
    .eq("id", delivery.data.id);
  await db
    .from("messages")
    .update({ provider: "resend", provider_message_id: sent.providerId })
    .eq("id", msg.data.id);
  // sent_at means "accepted by the email provider", not "delivered".
  await db.from("estimates").update({ status: "sent", sent_at: now }).eq("id", estimate.id);
  await db.from("projects").update({ stage: "estimate_sent" }).eq("id", projectId);
  await event("estimate.sent", "Ballpark estimate emailed to the customer", {
    estimate_id: estimate.id,
  });
}
