"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { sendRecordedEmail } from "@/lib/email/record";
import { emailEnabled } from "@/lib/email/resend";
import { consultationConfirmationEmail } from "@/lib/email/templates";
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
    .select("id, stage, contact_id, contacts(first_name, email)")
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
  if (emailEnabled() && contact?.email) {
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
      }),
      idempotencyKey: `consult-confirm:${appt.data.id}:1`,
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
