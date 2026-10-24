"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/auth";
import { createOrRefreshDraft } from "@/lib/assistant/drafts";
import { sendApprovedDraft } from "@/lib/assistant/send";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { OPEN_DRAFT, type ActionResult, type DraftT, type PanelData } from "./types";

// Every action here returns a result instead of reloading the page, so the inbox can update itself on the spot.

const text = (v: string, max: number) => String(v ?? "").trim().slice(0, max);
const DRAFT_COLUMNS = "id, status, subject, body_text, checks, source, error_summary, sent_at";

async function readDraft(db: SupabaseClient, id: string): Promise<DraftT | null> {
  const { data } = await db.from("email_drafts").select(DRAFT_COLUMNS).eq("id", id).maybeSingle();
  return (data as DraftT | null) ?? null;
}

// Opens an email that is not already on the page (for example from the Waiting tab): the email, its conversation and drafts.
export async function getPanel(id: string): Promise<PanelData | null> {
  await requireAdmin();
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data } = await (await createClient()).rpc("email_panel", { p_id: id });
  return (data as PanelData | null) ?? null;
}

// The earlier messages in a conversation, loaded quietly after an email opens.
export async function getThread(id: string): Promise<PanelData["thread"]> {
  const d = await getPanel(id);
  return d?.thread ?? [];
}

// Makes sure a draft reply is waiting, so the owner starts from a draft, not a blank page.
// Safe to call twice; it never replaces a draft that exists or an email that already has a sent reply.
export async function ensureDraft(emailId: string): Promise<ActionResult> {
  await requireAdmin();
  const db = createAdminClient();
  try {
    const { data: e } = await db.from("inbox_emails").select("direction, status, needs_reply").eq("id", emailId).maybeSingle();
    if (!e || e.direction !== "inbound" || e.status !== "open" || e.needs_reply === false) return { ok: true, draft: null };
    const { data: existing } = await db.from("email_drafts").select(DRAFT_COLUMNS).eq("email_id", emailId).in("status", [...OPEN_DRAFT, "sent"]).limit(1);
    if (existing && existing.length > 0) return { ok: true, draft: existing[0] as DraftT };
    const { draftId } = await createOrRefreshDraft(db, emailId);
    return { ok: true, draft: await readDraft(db, draftId) };
  } catch (err) {
    // A second tab or double call can lose the race to create the one open draft; that is fine.
    const { data: now } = await db.from("email_drafts").select(DRAFT_COLUMNS).eq("email_id", emailId).in("status", OPEN_DRAFT).limit(1);
    if (now && now.length > 0) return { ok: true, draft: now[0] as DraftT };
    console.error("[assistant] auto draft failed:", err);
    return { ok: false, notice: "draft-failed" };
  }
}

// Writes (or rewrites) the reply, optionally following an instruction. `blank` gives an empty draft to write by hand.
export async function writeDraft(emailId: string, instruction: string, blank = false): Promise<ActionResult> {
  await requireAdmin();
  const db = createAdminClient();
  try {
    const { draftId } = await createOrRefreshDraft(db, emailId, text(instruction, 500) || undefined, { blank });
    return { ok: true, notice: blank ? undefined : "drafted", draft: await readDraft(db, draftId) };
  } catch (e) {
    console.error("[assistant] draft failed:", e);
    return { ok: false, notice: "draft-failed" };
  }
}

// A nudge for a customer who has not answered. It lands as a normal draft to review and send.
export async function followUp(emailId: string, daysWaiting: number): Promise<ActionResult> {
  return writeDraft(
    emailId,
    `They have not replied for ${daysWaiting} days. Write a short, friendly follow-up that checks in and makes it easy to reply or book a consultation. Do not repeat the whole earlier message.`,
  );
}

export async function saveDraft(draftId: string, subject: string, body: string): Promise<ActionResult> {
  await requireAdmin();
  const { error } = await createAdminClient()
    .from("email_drafts")
    .update({ subject: text(subject, 300), body_text: text(body, 20000), status: "draft", approved_by: null, approved_at: null })
    .eq("id", draftId)
    .in("status", OPEN_DRAFT);
  return error ? { ok: false, notice: "invalid" } : { ok: true, notice: "saved" };
}

// Approval is the only way a reply leaves. Edits are saved first, so what is sent is what was approved.
export async function sendDraft(draftId: string, subject: string, body: string): Promise<ActionResult> {
  const me = await requireAdmin();
  const db = createAdminClient();
  const s = text(subject, 300);
  const b = text(body, 20000);
  const edits = s && b ? { subject: s, body_text: b } : {};

  const { data: approved, error } = await db
    .from("email_drafts")
    .update({ ...edits, status: "approved", approved_by: me.id, approved_at: new Date().toISOString(), error_summary: null })
    .eq("id", draftId)
    .in("status", OPEN_DRAFT)
    .select("id")
    .maybeSingle();
  if (error || !approved) return { ok: false, notice: "invalid" };

  const result = await sendApprovedDraft(db, draftId, me.id, me.display_name);
  const draft = await readDraft(db, draftId);
  if (result.ok) return { ok: true, notice: "sent", draft };
  if (result.code === "not-configured") return { ok: true, notice: "queued", draft };
  if (result.code === "demo") return { ok: false, notice: "demo", draft };
  return { ok: false, notice: "send-failed", draft };
}

export async function discardDraft(draftId: string): Promise<ActionResult> {
  await requireAdmin();
  await createAdminClient().from("email_drafts").update({ status: "rejected" }).eq("id", draftId).in("status", OPEN_DRAFT);
  return { ok: true, notice: "rejected" };
}

// open <-> handled <-> archived. "handled_at" is set exactly when the email is not open.
export async function setEmailStatus(id: string, status: "open" | "handled" | "archived"): Promise<ActionResult> {
  const me = await requireAdmin();
  const { error } = await createAdminClient()
    .from("inbox_emails")
    .update(
      status === "open"
        ? { status, handled_by: null, handled_at: null }
        : { status, handled_by: me.id, handled_at: new Date().toISOString() },
    )
    .eq("id", id);
  return error ? { ok: false, notice: "invalid" } : { ok: true };
}

// Marks an email as read once it has been opened.
export async function markRead(id: string): Promise<void> {
  await requireAdmin();
  if (!/^[0-9a-f-]{36}$/i.test(id)) return;
  await createAdminClient().from("inbox_emails").update({ read_at: new Date().toISOString() }).eq("id", id).is("read_at", null);
}

// A cheap check for new mail: the newest arrival and how many unread emails there are.
export async function mailPulse(): Promise<{ latest: string | null; unread: number }> {
  await requireAdmin();
  const supabase = await createClient();
  const [newest, unread] = await Promise.all([
    supabase.from("inbox_emails").select("received_at").eq("direction", "inbound").order("received_at", { ascending: false }).limit(1),
    supabase.from("inbox_emails").select("id", { count: "exact", head: true }).eq("direction", "inbound").is("read_at", null),
  ]);
  return { latest: newest.data?.[0]?.received_at ?? null, unread: unread.count ?? 0 };
}
