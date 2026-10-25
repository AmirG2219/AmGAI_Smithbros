"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { sendRecordedEmail } from "@/lib/email/record";
import { emailEnabled } from "@/lib/email/resend";
import { calendarLinks, icsFile } from "@/lib/email/calendar";
import { consultationConfirmationEmail } from "@/lib/email/templates";
import { sendEstimateForProject } from "@/lib/leads/estimate-send";
import { createAdminClient } from "@/lib/supabase/admin";
import { zonedToUtc } from "@/lib/timezone";

const TZ = "America/Edmonton";

export async function scheduleConsultation(projectId: string, formData: FormData) {
  const me = await requireAdmin();
  const db = createAdminClient();
  const back = (notice: string) => redirect(`/leads/${projectId}?notice=${notice}`);

  const start = zonedToUtc(String(formData.get("start") ?? ""), TZ);
  const minutes = Number(formData.get("minutes") ?? 60);
  if (!start || ![30, 45, 60, 90, 120].includes(minutes)) return back("invalid");
  const end = new Date(start.getTime() + minutes * 60_000);

  const { data: project } = await db
    .from("projects")
    .select("id, stage, contact_id, site_address_line1, site_city, site_region, site_postal_code, contacts(first_name, email)")
    .eq("id", projectId)
    .single();
  if (!project) return back("invalid");

  // One current booking per project: a new time means cancelling the old one first.
  const { data: open } = await db
    .from("appointments")
    .select("id")
    .eq("project_id", projectId)
    .eq("status", "scheduled")
    .limit(1);
  if (open && open.length > 0) return back("already-booked");

  const appt = await db
    .from("appointments")
    .insert({
      project_id: projectId,
      provider: "manual",
      start_at: start.toISOString(),
      end_at: end.toISOString(),
      timezone: TZ,
      status: "scheduled",
      booked_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (appt.error) throw appt.error;

  if (["new", "estimate_sent"].includes(project.stage))
    await db.from("projects").update({ stage: "consultation_booked" }).eq("id", projectId);

  const event = (event_type: string, summary: string, details: object = {}, actor = false) =>
    db.from("events").insert({
      contact_id: project.contact_id,
      project_id: projectId,
      event_type,
      summary,
      details,
      actor_user_id: actor ? me.id : null,
      source: actor ? "dashboard" : "email",
    });
  await event("appointment.scheduled", "Consultation scheduled", { appointment_id: appt.data.id }, true);

  let notice = "booked";
  const contact = Array.isArray(project.contacts) ? project.contacts[0] : project.contacts;
  const address = [project.site_address_line1, project.site_city, project.site_region, project.site_postal_code].filter(Boolean).join(", ") || null;
  const invite = {
    uid: appt.data.id as string,
    start,
    end,
    title: "Consultation with Smith Bros Floors",
    description: "Free flooring consultation. To change the time, reply to the confirmation email.",
    location: address,
  };
  const notify = formData.get("notify") === "on";
  if (!notify) {
    notice = "booked";
  } else if (emailEnabled() && contact?.email) {
    const r = await sendRecordedEmail({
      db,
      contactId: project.contact_id,
      projectId,
      to: contact.email,
      mail: consultationConfirmationEmail({
        firstName: contact.first_name,
        startAt: start,
        endAt: end,
        timeZone: TZ,
        address,
        calendar: calendarLinks(invite),
      }),
      idempotencyKey: `consult-confirm:${appt.data.id}:1`,
      replyTo: process.env.INBOX_ADDRESS || undefined,
      attachments: [{ filename: "consultation.ics", content: icsFile(invite), contentType: "text/calendar; method=PUBLISH" }],
    });
    if (r.status === "sent") {
      await event("appointment.confirmation_sent", "Consultation confirmation emailed");
      notice = "booked-emailed";
    } else {
      await event(
        `appointment.confirmation_${r.status}`,
        r.status === "skipped"
          ? `Confirmation not emailed: ${r.reason}`
          : "Confirmation email could not be sent",
      );
      notice = "booked-email-problem";
    }
  } else {
    notice = "booked-email-off";
  }

  revalidatePath(`/leads/${projectId}`);
  back(notice);
}

export async function cancelConsultation(projectId: string, appointmentId: string) {
  const me = await requireAdmin();
  const db = createAdminClient();

  const { data: appt } = await db
    .from("appointments")
    .select("id, status")
    .eq("id", appointmentId)
    .eq("project_id", projectId)
    .single();
  if (!appt || appt.status !== "scheduled") redirect(`/leads/${projectId}?notice=invalid`);

  const { error } = await db
    .from("appointments")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
    .eq("id", appointmentId);
  if (error) throw error;

  // Back to the stage that matches what actually happened before the booking.
  const { data: project } = await db
    .from("projects")
    .select("stage, contact_id")
    .eq("id", projectId)
    .single();
  if (project?.stage === "consultation_booked") {
    const { data: sent } = await db
      .from("estimates")
      .select("id")
      .eq("project_id", projectId)
      .eq("status", "sent")
      .limit(1);
    await db
      .from("projects")
      .update({ stage: sent && sent.length > 0 ? "estimate_sent" : "new" })
      .eq("id", projectId);
  }
  await db.from("events").insert({
    contact_id: project?.contact_id,
    project_id: projectId,
    event_type: "appointment.cancelled",
    summary: "Consultation cancelled",
    details: { appointment_id: appointmentId },
    actor_user_id: me.id,
    source: "dashboard",
  });

  revalidatePath(`/leads/${projectId}`);
  redirect(`/leads/${projectId}?notice=cancelled`);
}

// Staff confirm they have looked at a flagged lead. This only changes the review status: it never fills in missing
// details or edits the customer. The note and what was still missing are kept on the timeline.
export async function markReviewed(projectId: string, formData: FormData) {
  const me = await requireAdmin();
  const db = createAdminClient();
  const note = String(formData.get("note") ?? "").trim().slice(0, 500);

  const { data: project } = await db
    .from("projects")
    .select("contact_id, review_status, review_reason")
    .eq("id", projectId)
    .maybeSingle();
  if (!project) redirect("/leads");
  if (project.review_status !== "needs_review") redirect(`/leads/${projectId}?notice=already-reviewed`);

  // Only flips a lead that is still waiting, so a double click records one review.
  const up = await db
    .from("projects")
    .update({ review_status: "reviewed" })
    .eq("id", projectId)
    .eq("review_status", "needs_review")
    .select("id");
  if (up.error) throw up.error;

  if (up.data && up.data.length > 0)
    await db.from("events").insert({
      contact_id: project.contact_id,
      project_id: projectId,
      event_type: "project.review_resolved",
      summary: note ? `Review resolved by ${me.display_name}: ${note.slice(0, 200)}` : `Review resolved by ${me.display_name}`,
      details: { reason: project.review_reason, note: note || null },
      actor_user_id: me.id,
      source: "dashboard",
    });

  revalidatePath(`/leads/${projectId}`);
  redirect(`/leads/${projectId}?notice=reviewed`);
}

// Sends (or re-sends after a failure) the preliminary estimate that was approved automatically at intake. It can only ever
// send that exact approved revision; the checks and the demo-mode recipient guard live in sendEstimateForProject.
export async function sendEstimateAction(projectId: string, estimateId: string) {
  const me = await requireAdmin();
  const db = createAdminClient();
  let notice: string;
  try {
    const r = await sendEstimateForProject(db, { projectId, estimateId, actor: { id: me.id, name: me.display_name } });
    notice = r.ok ? "estimate-sent" : r.code === "skipped" ? "estimate-demo" : `estimate-${r.code}`;
  } catch (e) {
    // 23505: this exact send was already recorded (double click).
    notice = (e as { code?: string })?.code === "23505" ? "estimate-already-sent" : "estimate-failed";
    if (notice === "estimate-failed") console.error("[estimate] send failed:", e);
  }
  revalidatePath(`/leads/${projectId}`);
  redirect(`/leads/${projectId}?notice=${notice}`);
}
