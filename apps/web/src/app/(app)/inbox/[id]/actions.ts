"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createOrRefreshDraft } from "@/lib/assistant/drafts";
import { sendApprovedDraft } from "@/lib/assistant/send";
import { createAdminClient } from "@/lib/supabase/admin";

const text = (f: FormData, k: string, max: number) => String(f.get(k) ?? "").trim().slice(0, max);
const go = (emailId: string, notice: string) => {
  revalidatePath(`/inbox/${emailId}`);
  redirect(`/inbox/${emailId}?notice=${notice}`);
};

// Starts a reply: written by the AI when a key is set, otherwise a blank draft for the owner to write.
export async function writeReply(emailId: string, formData: FormData) {
  await requireAdmin();
  try {
    await createOrRefreshDraft(createAdminClient(), emailId, text(formData, "instruction", 500) || undefined);
  } catch (e) {
    console.error("[assistant] draft failed:", e);
    return go(emailId, "draft-failed");
  }
  go(emailId, "drafted");
}

export async function saveDraft(emailId: string, draftId: string, formData: FormData) {
  await requireAdmin();
  const { error } = await createAdminClient()
    .from("email_drafts")
    .update({ subject: text(formData, "subject", 300), body_text: text(formData, "body", 20000), status: "draft", approved_by: null, approved_at: null })
    .eq("id", draftId)
    .in("status", ["draft", "approved", "failed"]);
  if (error) return go(emailId, "invalid");
  go(emailId, "saved");
}

export async function rewriteDraft(emailId: string, _draftId: string, formData: FormData) {
  await requireAdmin();
  try {
    await createOrRefreshDraft(createAdminClient(), emailId, text(formData, "instruction", 500) || undefined);
  } catch (e) {
    console.error("[assistant] rewrite failed:", e);
    return go(emailId, "draft-failed");
  }
  go(emailId, "drafted");
}

// Approval is the only way a reply leaves. Edits made on the page are saved first, so what is sent is what was approved.
export async function approveAndSend(emailId: string, draftId: string, formData: FormData) {
  const me = await requireAdmin();
  const db = createAdminClient();

  const subject = text(formData, "subject", 300);
  const body = text(formData, "body", 20000);
  const edits = subject && body ? { subject, body_text: body } : {};

  const { data: approved, error } = await db
    .from("email_drafts")
    .update({ ...edits, status: "approved", approved_by: me.id, approved_at: new Date().toISOString(), error_summary: null })
    .eq("id", draftId)
    .in("status", ["draft", "approved", "failed"])
    .select("id")
    .maybeSingle();
  if (error || !approved) return go(emailId, "invalid");

  const result = await sendApprovedDraft(db, draftId, me.id, me.display_name);
  if (result.ok) return go(emailId, "sent");
  if (result.code === "not-configured") return go(emailId, "queued");
  if (result.code === "demo") return go(emailId, "demo");
  go(emailId, "send-failed");
}

export async function rejectDraft(emailId: string, draftId: string) {
  await requireAdmin();
  await createAdminClient().from("email_drafts").update({ status: "rejected" }).eq("id", draftId).in("status", ["draft", "approved", "failed"]);
  go(emailId, "rejected");
}
