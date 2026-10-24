"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createOrRefreshDraft } from "@/lib/assistant/drafts";
import { sendApprovedDraft } from "@/lib/assistant/send";
import { createAdminClient } from "@/lib/supabase/admin";

const text = (f: FormData, k: string, max: number) => String(f.get(k) ?? "").trim().slice(0, max);
const OPEN = ["draft", "approved", "failed"];

// Every action returns to the same inbox view (same tab and page) with the email still open in the side panel.
// "back" is the list address without the email, e.g. "/inbox?f=waiting"; only inbox addresses are accepted.
function dest(back: string, emailId: string | null, notice?: string) {
  const safe = back.startsWith("/inbox") && !back.startsWith("//") ? back : "/inbox";
  const u = new URL(safe, "http://local");
  u.searchParams.delete("e");
  u.searchParams.delete("notice");
  if (emailId) u.searchParams.set("e", emailId);
  if (notice) u.searchParams.set("notice", notice);
  return `${u.pathname}${u.search}`;
}
const go = (back: string, emailId: string, notice: string) => {
  revalidatePath("/inbox");
  redirect(dest(back, emailId, notice));
};

// open <-> handled <-> archived. "handled_at" is set exactly when the email is not open.
export async function setEmailStatus(id: string, status: "open" | "handled" | "archived", back: string) {
  const me = await requireAdmin();
  const { error } = await createAdminClient()
    .from("inbox_emails")
    .update(
      status === "open"
        ? { status, handled_by: null, handled_at: null }
        : { status, handled_by: me.id, handled_at: new Date().toISOString() },
    )
    .eq("id", id);
  if (error) throw error;
  revalidatePath("/inbox");
  // Closing an email returns to the list; reopening keeps it on screen.
  redirect(status === "open" ? dest(back, id) : dest(back, null));
}

// Writes a polite nudge for a customer who has not answered. It lands as a normal draft to review and approve.
export async function draftFollowUp(emailId: string, daysWaiting: number) {
  await requireAdmin();
  try {
    await createOrRefreshDraft(
      createAdminClient(),
      emailId,
      `They have not replied for ${daysWaiting} days. Write a short, friendly follow-up that checks in and makes it easy to reply or book a consultation. Do not repeat the whole earlier message.`,
    );
  } catch (e) {
    console.error("[assistant] follow-up draft failed:", e);
    return redirect(dest("/inbox?f=waiting", emailId, "draft-failed"));
  }
  redirect(dest("/inbox?f=waiting", emailId, "drafted"));
}

// Called when an email is opened: makes sure a draft reply is waiting, so the owner starts from a draft, not a blank page.
// Safe to call twice; it never replaces a draft that exists or an email that already has a sent reply.
export async function ensureDraft(emailId: string): Promise<{ ok: boolean }> {
  await requireAdmin();
  const db = createAdminClient();
  try {
    const { data: e } = await db.from("inbox_emails").select("direction, status, needs_reply").eq("id", emailId).maybeSingle();
    if (!e || e.direction !== "inbound" || e.status !== "open" || e.needs_reply === false) return { ok: true };
    const { data: drafts } = await db.from("email_drafts").select("status").eq("email_id", emailId).in("status", [...OPEN, "sent"]).limit(1);
    if (drafts && drafts.length > 0) return { ok: true };
    await createOrRefreshDraft(db, emailId);
    return { ok: true };
  } catch (err) {
    // A second tab or double call can lose the race to create the one open draft; that is fine.
    const { data: now } = await db.from("email_drafts").select("id").eq("email_id", emailId).in("status", OPEN).limit(1);
    if (now && now.length > 0) return { ok: true };
    console.error("[assistant] auto draft failed:", err);
    return { ok: false };
  }
}

// Starts or rewrites a reply on request (with an optional instruction).
export async function writeReply(emailId: string, back: string, formData: FormData) {
  await requireAdmin();
  try {
    await createOrRefreshDraft(createAdminClient(), emailId, text(formData, "instruction", 500) || undefined);
  } catch (e) {
    console.error("[assistant] draft failed:", e);
    return go(back, emailId, "draft-failed");
  }
  go(back, emailId, "drafted");
}

// A blank draft to write by hand, for when the assistant is unavailable or not wanted.
export async function blankReply(emailId: string, back: string) {
  await requireAdmin();
  try {
    await createOrRefreshDraft(createAdminClient(), emailId, undefined, { blank: true });
  } catch (e) {
    console.error("[assistant] blank draft failed:", e);
    return go(back, emailId, "draft-failed");
  }
  go(back, emailId, "saved");
}

export async function saveDraft(emailId: string, draftId: string, back: string, formData: FormData) {
  await requireAdmin();
  const { error } = await createAdminClient()
    .from("email_drafts")
    .update({ subject: text(formData, "subject", 300), body_text: text(formData, "body", 20000), status: "draft", approved_by: null, approved_at: null })
    .eq("id", draftId)
    .in("status", OPEN);
  if (error) return go(back, emailId, "invalid");
  go(back, emailId, "saved");
}

// Approval is the only way a reply leaves. Edits made on the page are saved first, so what is sent is what was approved.
export async function approveAndSend(emailId: string, draftId: string, back: string, formData: FormData) {
  const me = await requireAdmin();
  const db = createAdminClient();

  const subject = text(formData, "subject", 300);
  const body = text(formData, "body", 20000);
  const edits = subject && body ? { subject, body_text: body } : {};

  const { data: approved, error } = await db
    .from("email_drafts")
    .update({ ...edits, status: "approved", approved_by: me.id, approved_at: new Date().toISOString(), error_summary: null })
    .eq("id", draftId)
    .in("status", OPEN)
    .select("id")
    .maybeSingle();
  if (error || !approved) return go(back, emailId, "invalid");

  const result = await sendApprovedDraft(db, draftId, me.id, me.display_name);
  if (result.ok) return go(back, emailId, "sent");
  if (result.code === "not-configured") return go(back, emailId, "queued");
  if (result.code === "demo") return go(back, emailId, "demo");
  go(back, emailId, "send-failed");
}

export async function rejectDraft(emailId: string, draftId: string, back: string) {
  await requireAdmin();
  await createAdminClient().from("email_drafts").update({ status: "rejected" }).eq("id", draftId).in("status", OPEN);
  go(back, emailId, "rejected");
}
