"use server";

import { redirect } from "next/navigation";
import { UserError, findOrCreateCustomer, type PossibleMatch } from "@/lib/agreements/build";
import { requireAdmin } from "@/lib/auth";
import { sourceLabel } from "@/lib/contacts/sources";
import { missingDetails, parseManualLead, reviewReason } from "@/lib/leads/manual";
import { createAdminClient } from "@/lib/supabase/admin";

export type NewLeadState = { error?: string; matches?: PossibleMatch[] } | null;

const UUID = /^[0-9a-f-]{36}$/i;
const lower = (s: unknown) => String(s ?? "").trim().toLowerCase();
const digits = (s: unknown) => String(s ?? "").replace(/\D/g, "");

// Creates a lead entered by staff. Reuses the agreements customer rules (same email = same customer; a matching phone
// asks staff to confirm). Nothing is scored, estimated or emailed: gaps are flagged for review instead of filled in.
export async function createLeadAction(_prev: NewLeadState, formData: FormData): Promise<NewLeadState> {
  const me = await requireAdmin();
  const input = Object.fromEntries(formData);
  const db = createAdminClient();

  const lead = parseManualLead(input);
  if (!lead.ok) return { error: lead.error };
  const l = lead.value;

  // The same form submitted twice reuses this key, so it can only ever make one lead.
  const keyPart = String(formData.get("submission_key") ?? "").slice(0, 60);
  const submissionKey = keyPart.length >= 8 ? `manual:${keyPart}` : null;
  const existingLead = async () => {
    if (!submissionKey) return null;
    const { data } = await db.from("projects").select("id").eq("source_submission_key", submissionKey).maybeSingle();
    return (data?.id as string | undefined) ?? null;
  };
  const already = await existingLead();
  if (already) redirect(`/leads/${already}?notice=lead-created`);

  let projectId: string;
  try {
    // Customer: a picked existing one, or find/create from the typed details.
    const picked = String(formData.get("use_customer") || formData.get("customer_id") || "");
    let contactId: string;
    let emailMatch = false;
    if (picked) {
      if (!UUID.test(picked)) return { error: "That customer could not be found." };
      contactId = picked;
    } else {
      const r = await findOrCreateCustomer(db, input, { confirmNew: formData.get("confirm_new") === "1" });
      if (r.kind === "phone_match") return { matches: r.matches };
      contactId = r.id;
      emailMatch = r.kind === "existing";
    }

    const { data: contact } = await db.from("contacts").select("id, first_name, last_name, email, phone").eq("id", contactId).maybeSingle();
    if (!contact) return { error: "That customer could not be found." };

    // Typed details that disagree with a customer matched by email are flagged, never overwritten.
    const differs =
      emailMatch &&
      ((lower(input.first_name) !== "" && lower(input.first_name) !== lower(contact.first_name)) ||
        (lower(input.last_name) !== "" && lower(input.last_name) !== lower(contact.last_name)) ||
        (digits(input.phone) !== "" && digits(input.phone) !== digits(contact.phone)));

    const src = sourceLabel(l.lead_source);
    const missing = missingDetails(l, !!(contact.email || contact.phone));
    const reason = reviewReason(src, missing, differs);

    const ins = await db
      .from("projects")
      .insert({
        contact_id: contactId,
        project_type: l.project_type,
        square_footage: l.square_footage,
        timeline_preference: l.timeline,
        site_address_line1: l.site_address_line1,
        site_city: l.site_city,
        site_postal_code: l.site_postal_code,
        additional_answers: {
          origin: "manual_lead",
          lead_source: l.lead_source,
          notes: l.notes,
          ...(differs
            ? { submitted_contact: { first_name: String(input.first_name ?? "") || null, last_name: String(input.last_name ?? "") || null, phone: String(input.phone ?? "") || null } }
            : {}),
        },
        review_status: reason ? "needs_review" : "none",
        review_reason: reason,
        source_submission_key: submissionKey,
      })
      .select("id")
      .single();
    if (ins.error) {
      const dup = ins.error.code === "23505" ? await existingLead() : null;
      if (!dup) throw ins.error;
      projectId = dup;
    } else {
      projectId = ins.data.id as string;
      await db.from("events").insert({
        contact_id: contactId,
        project_id: projectId,
        event_type: "project.manual_lead_created",
        summary: `Lead added by ${me.display_name} (${src})`,
        details: { lead_source: l.lead_source, needs_review: !!reason, missing },
        actor_user_id: me.id,
        source: "dashboard",
      });
    }
  } catch (e) {
    if (e instanceof UserError) return { error: e.message };
    console.error("[leads] manual lead failed:", e);
    return { error: "Something went wrong. The lead was not saved. Please try again." };
  }
  redirect(`/leads/${projectId}?notice=lead-created`);
}
