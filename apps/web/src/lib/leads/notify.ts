import type { SupabaseClient } from "@supabase/supabase-js";
import { sendRecordedEmail } from "@/lib/email/record";
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

  // draft -> approved (rule-based automatic approval; no human approver)
  const approve = await db
    .from("estimates")
    .update({ status: "approved", approved_at: new Date().toISOString() })
    .eq("id", estimate.id)
    .eq("status", "draft");
  if (approve.error) throw approve.error;

  const result = await sendRecordedEmail({
    db,
    contactId,
    projectId,
    to: q.email,
    mail: customerEstimateEmail({
      firstName: q.first_name,
      projectType: q.project_type,
      material: q.material,
      squareFootage: q.square_footage,
      min: estimate.min,
      max: estimate.max,
      isSample: estimate.isSample,
      bookingUrl: process.env.CALENDLY_URL || null,
    }),
    idempotencyKey: `estimate-email:${estimate.id}:1`,
  });

  if (result.status === "skipped") {
    await event("estimate.send_skipped", `Estimate not emailed: ${result.reason}`);
    return;
  }
  if (result.status === "failed") {
    await event("estimate.send_failed", "Estimate email could not be sent", { code: result.code });
    return;
  }

  // sent_at means "accepted by the email provider", not "delivered".
  const now = new Date().toISOString();
  await db.from("estimates").update({ status: "sent", sent_at: now }).eq("id", estimate.id);
  await db.from("projects").update({ stage: "estimate_sent" }).eq("id", projectId);
  await event("estimate.sent", "Ballpark estimate emailed to the customer", {
    estimate_id: estimate.id,
  });
}
