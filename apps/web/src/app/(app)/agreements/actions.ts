"use server";

import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createAgreements, UserError, type DocType } from "@/lib/agreements/create";
import { createAdminClient } from "@/lib/supabase/admin";

const text = (f: FormData, k: string) => {
  const v = String(f.get(k) ?? "").trim();
  return v || null;
};

export async function createAgreementsAction(formData: FormData) {
  const me = await requireAdmin();
  const fail = (msg: string) => redirect(`/agreements/new?error=${encodeURIComponent(msg)}`);

  const docs = (["work_contract", "policy_liability"] as DocType[]).filter(
    (d) => formData.get(`doc_${d}`) === "on",
  );
  const leadId = text(formData, "project_id");
  const subtotal = Number(formData.get("subtotal"));

  let projectId: string;
  try {
    const r = await createAgreements(createAdminClient(), me.id, {
      projectId: leadId,
      client: {
        first_name: text(formData, "first_name") ?? "",
        last_name: text(formData, "last_name"),
        email: text(formData, "email"),
        phone: text(formData, "phone"),
      },
      site: {
        line1: text(formData, "site_line1"),
        city: text(formData, "site_city"),
        postal: text(formData, "site_postal"),
      },
      docs,
      scope: text(formData, "scope"),
      exclusions: text(formData, "exclusions"),
      subtotal: Number.isFinite(subtotal) && subtotal > 0 ? subtotal : null,
      taxRatePercent: Number(formData.get("tax_rate") ?? 5) || 0,
      paymentTerms: text(formData, "payment_terms"),
      startDate: text(formData, "start_date"),
      completionEstimate: text(formData, "completion_estimate"),
      customerAccepted: formData.get("accepted") === "on",
    });
    projectId = r.projectId;
  } catch (e) {
    if (e instanceof UserError) return fail(e.message);
    console.error("[agreements] create failed:", e);
    return fail("Something went wrong creating the documents. Nothing was sent. Please try again.");
  }
  redirect(`/agreements?notice=created&project=${projectId}`);
}
