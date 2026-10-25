import type { SupabaseClient } from "@supabase/supabase-js";
import { sendRecordedEmail } from "@/lib/email/record";
import { emailEnabled } from "@/lib/email/resend";
import { acknowledgmentEmail, customerEstimateEmail } from "@/lib/email/templates";
import { sendApprovedEstimate, type SendResult } from "./estimate-approval";
import { supabaseEstimateStore } from "./estimate-store";

type Actor = { id: string; name: string } | null; // null = the system, acting automatically on intake

type Contact = { contactId: string; stage: string; firstName: string; email: string | null };

async function loadContact(db: SupabaseClient, projectId: string): Promise<Contact | null> {
  const { data: p } = await db.from("projects").select("contact_id, stage, contacts(first_name, email)").eq("id", projectId).maybeSingle();
  if (!p) return null;
  const c = Array.isArray(p.contacts) ? p.contacts[0] : p.contacts;
  return { contactId: p.contact_id, stage: p.stage, firstName: c?.first_name ?? "there", email: c?.email ?? null };
}

const event = (db: SupabaseClient, c: Contact, projectId: string, actor: Actor, type: string, summary: string, details: object = {}) =>
  db.from("events").insert({
    contact_id: c.contactId,
    project_id: projectId,
    event_type: type,
    summary,
    details,
    actor_user_id: actor?.id ?? null,
    source: actor ? "dashboard" : "email",
  });

// Emails the approved preliminary estimate and records exactly what happened: sent, skipped (demo mode / email off),
// failed, or refused (stale, placeholder). The project moves to "estimate_sent" only when the email really went out.
export async function sendEstimateForProject(
  db: SupabaseClient,
  a: { projectId: string; estimateId: string; actor: Actor },
): Promise<SendResult | { ok: false; code: "no-email" }> {
  const c = await loadContact(db, a.projectId);
  if (!c?.email) return { ok: false, code: "no-email" };
  const email = c.email;

  const r = await sendApprovedEstimate(supabaseEstimateStore(db), {
    estimateId: a.estimateId,
    projectId: a.projectId,
    emailEnabled: emailEnabled(),
    deliver: (e) => {
      const i = e.input_snapshot as { project_type?: string; material?: string; square_footage?: number | null };
      return sendRecordedEmail({
        db,
        contactId: c.contactId,
        projectId: a.projectId,
        to: email,
        mail: customerEstimateEmail({
          firstName: c.firstName,
          projectType: String(i.project_type ?? ""),
          material: String(i.material ?? "hardwood"),
          squareFootage: i.square_footage ?? null,
          min: e.price_min!,
          max: e.price_max!,
          bookingUrl: process.env.CALENDLY_URL || null,
        }),
        idempotencyKey: `estimate-email:${e.id}:1`,
        replyTo: process.env.INBOX_ADDRESS || undefined,
      });
    },
  });

  const details = { estimate_id: a.estimateId };
  if (r.ok) {
    if (c.stage === "new") await db.from("projects").update({ stage: "estimate_sent" }).eq("id", a.projectId).eq("stage", "new");
    await event(db, c, a.projectId, a.actor, "estimate.sent", `Preliminary estimate (revision ${r.revision}) emailed to the customer${a.actor ? ` by ${a.actor.name}` : " automatically"}`, details);
  } else if (r.code === "skipped") {
    await event(db, c, a.projectId, a.actor, "estimate.send_skipped", `Estimate not emailed: ${r.reason}`, details);
  } else if (r.code === "failed") {
    await event(db, c, a.projectId, a.actor, "estimate.send_failed", "Estimate email could not be sent", details);
  } else if (r.code === "email-off") {
    await event(db, c, a.projectId, a.actor, "estimate.send_skipped", "Estimate not emailed: email sending is not configured", details);
  } else if (r.code === "stale" || r.code === "placeholder") {
    await event(db, c, a.projectId, a.actor, "estimate.send_refused", r.code === "stale" ? "Estimate not emailed: a newer revision exists" : "Estimate not emailed: placeholder pricing is never sent", details);
  }
  return r;
}

// The no-price reply for a lead we cannot estimate automatically. It promises a follow-up, never a number.
export async function sendAcknowledgment(db: SupabaseClient, projectId: string) {
  const c = await loadContact(db, projectId);
  if (!c?.email) return;
  if (!emailEnabled()) {
    await event(db, c, projectId, null, "inquiry.acknowledgment_skipped", "Acknowledgment not emailed: email sending is not configured");
    return;
  }
  const r = await sendRecordedEmail({
    db,
    contactId: c.contactId,
    projectId,
    to: c.email,
    mail: acknowledgmentEmail({ firstName: c.firstName, bookingUrl: process.env.CALENDLY_URL || null }),
    idempotencyKey: `inquiry-ack:${projectId}`,
    replyTo: process.env.INBOX_ADDRESS || undefined,
  });
  if (r.status === "sent") await event(db, c, projectId, null, "inquiry.acknowledgment_sent", "Acknowledgment (no price) emailed to the customer");
  else if (r.status === "skipped") await event(db, c, projectId, null, "inquiry.acknowledgment_skipped", `Acknowledgment not emailed: ${r.reason}`);
  else await event(db, c, projectId, null, "inquiry.acknowledgment_failed", "Acknowledgment email could not be sent");
}
