"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

// Records marketing-consent evidence for a contact's current email address. Consent is an append-only log:
// withdrawing adds a new event rather than editing the old one.
export async function recordConsent(contactId: string, formData: FormData) {
  const me = await requireAdmin();
  const db = createAdminClient();
  const action = String(formData.get("action") ?? "grant");
  const source = String(formData.get("source") ?? "").trim().slice(0, 300);
  const basis = String(formData.get("legal_basis") ?? "");

  const { data: contact } = await db.from("contacts").select("email_normalized").eq("id", contactId).single();
  if (!contact?.email_normalized) return;

  if (action === "grant") {
    if (!source || !["express", "implied", "other_verified"].includes(basis)) return;
  }

  const { error } = await db.from("consent_events").insert({
    contact_id: contactId,
    channel: "email",
    purpose: "marketing",
    event_type: action === "grant" ? "granted" : "withdrawn",
    legal_basis: action === "grant" ? basis : null,
    source: action === "grant" ? source : source || "dashboard",
    address_normalized: contact.email_normalized,
    evidence: { recorded_in: "dashboard", note: source },
    occurred_at: new Date().toISOString(),
    recorded_by: me.id,
  });
  if (error) throw error;
  revalidatePath("/contacts");
}
