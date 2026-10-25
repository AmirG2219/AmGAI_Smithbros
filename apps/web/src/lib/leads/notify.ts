import type { SupabaseClient } from "@supabase/supabase-js";
import { emailEnabled, sendEmail } from "@/lib/email/resend";
import { autoApproveEstimate } from "./estimate-approval";
import { sendAcknowledgment, sendEstimateForProject } from "./estimate-send";
import { supabaseEstimateStore } from "./estimate-store";
import { staffAlertEmail } from "@/lib/email/templates";
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
  // Independent: a failed staff alert must not block the customer's email, and vice versa. Each records its own outcome.
  const results = await Promise.allSettled([emailEnabled() ? staffAlert(ctx) : Promise.resolve(), customerReply(ctx)]);
  for (const r of results) if (r.status === "rejected") console.error("[notify] failed:", r.reason);
}

// A priced estimate (approved, non-placeholder rule) is approved by rule and emailed as a non-binding range.
// Everything else gets an acknowledgment with no price. Either way the outcome is recorded on the lead's timeline.
async function customerReply({ db, projectId, estimate }: NotifyContext) {
  if (estimate?.priced && !estimate.isSample) {
    const approved = await autoApproveEstimate(supabaseEstimateStore(db), { estimateId: estimate.id, projectId });
    if (approved.ok) {
      await sendEstimateForProject(db, { projectId, estimateId: estimate.id, actor: null });
      return;
    }
    console.error(`[notify] estimate ${estimate.id} was not auto-approved: ${approved.code}`);
  }
  await sendAcknowledgment(db, projectId);
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
    squareFootage: q.square_footage,
    timeline: q.timeline,
    rooms: q.rooms,
    species: q.species,
    pattern: q.pattern,
    finish: q.finish,
    preferredContact: q.preferred_contact,
    notes: q.notes,
    score: score?.score ?? null,
    classification: score?.classification ?? null,
    estimate:
      estimate?.priced && estimate.min !== undefined && estimate.max !== undefined
        ? { min: estimate.min, max: estimate.max, isSample: estimate.isSample }
        : null,
    submittedAt: new Date(),
    dashboardUrl: `${appUrl()}/leads/${projectId}`,
  });
  const r = await sendEmail({ to, ...mail, idempotencyKey: `staff-alert:${projectId}` });
  if (!r.ok) console.error(`[notify] staff alert failed (${r.code}): ${r.summary}`);
}
