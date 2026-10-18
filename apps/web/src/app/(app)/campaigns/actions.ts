"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { checkEligibility, findCandidates, parseFilter } from "@/lib/campaigns/audience";
import { aiEnabled, draftCampaign, type CampaignDraft } from "@/lib/campaigns/ai";
import { dispatchCampaign } from "@/lib/campaigns/dispatch";
import { mergeFields } from "@/lib/campaigns/email";
import { emailEnabled } from "@/lib/email/resend";
import { createAdminClient } from "@/lib/supabase/admin";

const text = (f: FormData, k: string, max = 4000) => String(f.get(k) ?? "").trim().slice(0, max);

// Carries the form between the editor and the preview in the URL, so nothing is saved until confirmed.
function formToQuery(f: FormData) {
  const p = new URLSearchParams();
  for (const k of ["name", "instruction", "subject", "body", "inactive_months"]) p.set(k, text(f, k));
  for (const k of ["project_types", "materials", "stages"]) p.set(k, f.getAll(k).map(String).join(","));
  return p.toString();
}

export async function draftWithAi(formData: FormData) {
  await requireAdmin();
  const instruction = text(formData, "instruction", 2000);
  if (!instruction || !aiEnabled()) redirect("/campaigns/new");

  let d: CampaignDraft;
  try {
    d = await draftCampaign(instruction);
  } catch (e) {
    console.error("[campaigns] AI draft failed:", e);
    return redirect(`/campaigns/new?instruction=${encodeURIComponent(instruction)}&error=ai`);
  }
  const p = new URLSearchParams({
    name: d.name,
    instruction,
    subject: d.subject,
    body: d.body,
    project_types: d.filter.project_types.join(","),
    materials: d.filter.materials.join(","),
    stages: d.filter.stages.join(","),
    inactive_months: d.filter.inactive_months ? String(d.filter.inactive_months) : "",
    ai: "1",
  });
  redirect(`/campaigns/new?${p}`);
}

export async function createCampaign(formData: FormData) {
  const me = await requireAdmin();
  const db = createAdminClient();
  const name = text(formData, "name", 120);
  const instruction = text(formData, "instruction", 2000);
  const subject = text(formData, "subject", 200);
  const body = text(formData, "body");
  const back = (error: string) => redirect(`/campaigns/new?${formToQuery(formData)}&error=${error}`);
  if (!name || !instruction || !subject || !body) return back("missing");

  const filter = parseFilter({
    project_types: text(formData, "project_types"),
    materials: text(formData, "materials"),
    stages: text(formData, "stages"),
    inactive_months: text(formData, "inactive_months"),
  });
  const { eligible } = await checkEligibility(db, await findCandidates(db, filter));
  if (eligible.length === 0) return back("no-recipients");

  // The filter and the email template are stored together; each recipient also gets a frozen, merged copy.
  const c = await db
    .from("campaigns")
    .insert({
      name,
      instruction_text: instruction,
      audience_filter: { filter, template: { subject, body } },
      filter_schema_version: "v1",
      created_by: me.id,
    })
    .select("id, content_revision")
    .single();
  if (c.error) throw c.error;

  const rows = eligible.map((e) => ({
    campaign_id: c.data.id,
    contact_id: e.contact_id,
    email_snapshot: e.email,
    subject: mergeFields(subject, e),
    body_text: mergeFields(body, e),
    content_revision: c.data.content_revision,
  }));
  for (let i = 0; i < rows.length; i += 200) {
    const r = await db.from("campaign_recipients").insert(rows.slice(i, i + 200));
    if (r.error) throw r.error;
  }
  redirect(`/campaigns/${c.data.id}?notice=created`);
}

async function load(id: string) {
  const db = createAdminClient();
  const { data } = await db.from("campaigns").select("id, status, content_revision").eq("id", id).single();
  if (!data) redirect("/campaigns");
  return { db, c: data as { id: string; status: string; content_revision: number } };
}
const done = (id: string, notice: string) => {
  revalidatePath(`/campaigns/${id}`);
  redirect(`/campaigns/${id}?notice=${notice}`);
};

export async function submitForReview(id: string) {
  await requireAdmin();
  const { db, c } = await load(id);
  if (c.status === "draft") await db.from("campaigns").update({ status: "ready_for_review" }).eq("id", id);
  done(id, "review");
}

export async function approveCampaign(id: string) {
  const me = await requireAdmin();
  const { db, c } = await load(id);
  if (c.status !== "ready_for_review") return done(id, "invalid");
  const r = await db
    .from("campaigns")
    .update({
      status: "approved",
      approved_by: me.id,
      approved_at: new Date().toISOString(),
      approved_revision: c.content_revision,
    })
    .eq("id", id);
  if (r.error) throw r.error;
  done(id, "approved");
}

export async function cancelCampaign(id: string) {
  await requireAdmin();
  const { db, c } = await load(id);
  if (["draft", "ready_for_review", "approved"].includes(c.status))
    await db.from("campaigns").update({ status: "cancelled" }).eq("id", id);
  done(id, "cancelled");
}

export async function sendCampaign(id: string) {
  await requireAdmin();
  const { db, c } = await load(id);
  if (c.status !== "approved" && c.status !== "sending") return done(id, "invalid");
  if (!emailEnabled()) return done(id, "email-off");

  const { data: demo } = await db.from("settings").select("value").eq("key", "demo_mode").maybeSingle();
  const demoOn = (demo?.value as { enabled?: boolean } | undefined)?.enabled === true;
  if (!demoOn && !process.env.COMPANY_ADDRESS?.trim()) return done(id, "address-needed");

  if (c.status === "approved") {
    const r = await db.from("campaigns").update({ status: "sending" }).eq("id", id);
    if (r.error) throw r.error;
  }
  after(() => dispatchCampaign(db, id));
  done(id, "sending");
}
