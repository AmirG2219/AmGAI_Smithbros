"use server";

import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createAgreements, UserError, type DocType } from "@/lib/agreements/create";
import { createAdminClient } from "@/lib/supabase/admin";

const text = (f: FormData, k: string) => {
  const v = String(f.get(k) ?? "").trim();
  return v || null;
};

const SECTION: Record<DocType, string> = { work_contract: "/contracts", policy_liability: "/agreements" };

// Creates one document: a work contract or a policy and liability agreement.
export async function createDocumentAction(formData: FormData) {
  const me = await requireAdmin();
  const type = String(formData.get("doc_type")) as DocType;
  if (!(type in SECTION)) redirect("/documents/new");
  const fail = (msg: string) => redirect(`/documents/new?type=${type}&error=${encodeURIComponent(msg)}`);

  const subtotal = Number(formData.get("subtotal"));
  try {
    await createAgreements(createAdminClient(), me.id, {
      projectId: text(formData, "project_id"),
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
      docs: [type],
      scope: text(formData, "scope"),
      exclusions: text(formData, "exclusions"),
      subtotal: Number.isFinite(subtotal) && subtotal > 0 ? subtotal : null,
      taxRatePercent: Number(formData.get("tax_rate") ?? 5) || 0,
      depositPercent: Number(formData.get("deposit_percent") ?? 50),
      paymentTerms: text(formData, "payment_terms"),
      startDate: text(formData, "start_date"),
      completionEstimate: text(formData, "completion_estimate"),
      customerAccepted: formData.get("accepted") === "on",
    });
  } catch (e) {
    if (e instanceof UserError) return fail(e.message);
    console.error("[documents] create failed:", e);
    return fail("Something went wrong creating the document. Nothing was sent. Please try again.");
  }
  redirect(`${SECTION[type]}?notice=created`);
}
