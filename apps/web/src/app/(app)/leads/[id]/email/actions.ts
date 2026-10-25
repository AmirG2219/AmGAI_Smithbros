"use server";

import { replyToAddress, replyToConfigured } from "@/lib/email/reply-to";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { sendRecordedEmail } from "@/lib/email/record";
import { emailEnabled } from "@/lib/email/resend";
import { plainEmail } from "@/lib/email/templates";
import { draftEnabled, draftLeadEmail } from "@/lib/leads/email-draft";
import { loadLeadForEmail } from "@/lib/leads/email-context";
import { createAdminClient } from "@/lib/supabase/admin";

const text = (f: FormData, k: string, max: number) => String(f.get(k) ?? "").trim().slice(0, max);

// Keeps what was typed when we send the user back to the form with a message.
const back = (leadId: string, subject: string, body: string, extra: Record<string, string>) =>
  redirect(`/leads/${leadId}/email?${new URLSearchParams({ subject, body, ...extra })}`);

export async function draftEmailAction(leadId: string, formData: FormData) {
  await requireAdmin();
  const goal = text(formData, "goal", 500);
  const subject = text(formData, "subject", 200);
  const body = text(formData, "body", 5000);
  if (!draftEnabled()) return back(leadId, subject, body, { error: "ai-off" });

  const lead = await loadLeadForEmail(createAdminClient(), leadId);
  if (!lead) return redirect("/leads");
  try {
    const d = await draftLeadEmail(goal, lead.ctx);
    return back(leadId, d.subject, d.body, { ai: "1" });
  } catch (e) {
    console.error("[lead email] AI draft failed:", e);
    return back(leadId, subject, body, { error: "ai-failed" });
  }
}

export async function sendEmailAction(leadId: string, formData: FormData) {
  const me = await requireAdmin();
  const subject = text(formData, "subject", 200);
  const body = text(formData, "body", 5000);
  const sendKey = text(formData, "send_key", 80) || crypto.randomUUID();
  if (!subject || !body) return back(leadId, subject, body, { error: "missing" });
  if (!emailEnabled()) return back(leadId, subject, body, { error: "off" });
  if (!replyToConfigured()) return back(leadId, subject, body, { error: "no-inbox" });

  const db = createAdminClient();
  const lead = await loadLeadForEmail(db, leadId);
  if (!lead) return redirect("/leads");
  if (!lead.email) return back(leadId, subject, body, { error: "no-email" });

  const mail = plainEmail({ subject, body, signature: `${me.display_name}\nSmith Bros Floors` });
  let result;
  try {
    result = await sendRecordedEmail({
      db,
      contactId: lead.contactId,
      projectId: leadId,
      to: lead.email,
      mail,
      // The same form submitted twice reuses this key, so the customer can never get the email twice.
      idempotencyKey: `lead-email:${leadId}:${sendKey}`,
      replyTo: replyToAddress(),
    });
  } catch (e) {
    // 23505 = this exact send was already recorded (double click). Treat as done.
    if ((e as { code?: string })?.code === "23505") return redirect(`/leads/${leadId}?notice=email-sent`);
    console.error("[lead email] send failed:", e);
    return back(leadId, subject, body, { error: "failed" });
  }

  if (result.status === "skipped") return back(leadId, subject, body, { error: "demo" });
  if (result.status === "failed") return back(leadId, subject, body, { error: "failed" });

  await db.from("events").insert({
    contact_id: lead.contactId,
    project_id: leadId,
    event_type: "email.sent",
    summary: `Email sent to ${lead.fullName}: ${subject.slice(0, 120)}`,
    details: {},
    actor_user_id: me.id,
    source: "dashboard",
  });
  redirect(`/leads/${leadId}?notice=email-sent`);
}
