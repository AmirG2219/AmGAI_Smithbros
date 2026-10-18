import type { SupabaseClient } from "@supabase/supabase-js";
import { estimateRange, type LeadEmailContext } from "./email-draft";

type Estimate = {
  status: string;
  price_min: number | null;
  price_max: number | null;
  revision_number: number;
  pricing_snapshot: { is_placeholder?: boolean } | null;
};

// Loads what we know about a lead. Works with either the signed-in user's client or the admin client.
export async function loadLeadForEmail(db: SupabaseClient, leadId: string) {
  const { data: p } = await db
    .from("projects")
    .select(
      "id, contact_id, project_type, square_footage, timeline_preference, stage, additional_answers, contacts(first_name, last_name, email), estimates(status, price_min, price_max, revision_number, pricing_snapshot), appointments(status, start_at)",
    )
    .eq("id", leadId)
    .maybeSingle();
  if (!p) return null;

  const c = Array.isArray(p.contacts) ? p.contacts[0] : p.contacts;
  const estimates = ((p.estimates ?? []) as Estimate[])
    .filter((e) => e.status === "sent")
    .sort((a, b) => b.revision_number - a.revision_number);
  const sent = estimates[0];
  // Placeholder pricing is never quoted to a customer.
  const realEstimate =
    sent && sent.price_min !== null && sent.price_max !== null && sent.pricing_snapshot?.is_placeholder === false
      ? estimateRange(sent.price_min, sent.price_max)
      : null;

  const appt = ((p.appointments ?? []) as { status: string; start_at: string }[]).find((a) => a.status === "scheduled");
  const answers = (p.additional_answers ?? {}) as { notes?: string };

  const ctx: LeadEmailContext = {
    firstName: c?.first_name ?? "there",
    projectType: p.project_type,
    squareFootage: p.square_footage ? Number(p.square_footage) : null,
    timeline: p.timeline_preference,
    stage: p.stage,
    estimateText: realEstimate,
    consultationText: appt
      ? new Date(appt.start_at).toLocaleString("en-CA", {
          timeZone: "America/Edmonton",
          weekday: "long",
          month: "long",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        })
      : null,
    bookingUrl: process.env.CALENDLY_URL || null,
    customerNotes: answers.notes ?? null,
  };

  return {
    ctx,
    contactId: p.contact_id as string,
    email: (c?.email as string | null) ?? null,
    fullName: [c?.first_name, c?.last_name].filter(Boolean).join(" "),
  };
}
