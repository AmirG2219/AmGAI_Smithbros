import type { SupabaseClient } from "@supabase/supabase-js";
import { allowedByDemoMode } from "@/lib/email/record";
import { explicitProjectId } from "@/lib/inbox/links";
import { defaultSignature, loadKnowledge } from "./knowledge";

// Replies go out from the owner's own Gmail through an n8n workflow, so they thread properly in his mailbox.
export const gmailSendConfigured = () => !!process.env.GMAIL_SEND_WEBHOOK_URL && !!process.env.GMAIL_SEND_SECRET;

export type SendOutcome =
  | { ok: true }
  | { ok: false; code: "not-configured" | "demo" | "failed" | "state"; message: string };

// Sends an approved (or previously failed) draft. Every path leaves the draft in an honest state.
export async function sendApprovedDraft(db: SupabaseClient, draftId: string, adminId: string, ownerName: string): Promise<SendOutcome> {
  const { data: d } = await db
    .from("email_drafts")
    .select("id, status, subject, body_text, email_id, inbox_emails(id, from_address, from_name, provider_message_id, provider_thread_id, contact_id, project_id)")
    .eq("id", draftId)
    .single();
  if (!d) return { ok: false, code: "state", message: "Draft not found." };
  if (d.status !== "approved" && d.status !== "failed") return { ok: false, code: "state", message: "This draft is not ready to send." };
  const email = Array.isArray(d.inbox_emails) ? d.inbox_emails[0] : d.inbox_emails;
  if (!email) return { ok: false, code: "state", message: "The original email is missing." };

  if (!gmailSendConfigured())
    return { ok: false, code: "not-configured", message: "Approved. It will send once the Gmail connection is set up." };

  const fail = async (code: "demo" | "failed", message: string): Promise<SendOutcome> => {
    await db.from("email_drafts").update({ status: "failed", error_summary: message.slice(0, 500) }).eq("id", draftId);
    return { ok: false, code, message };
  };

  // Same safety as the rest of the system: while demo mode is on, mail only goes to approved test addresses.
  if (!(await allowedByDemoMode(db, email.from_address)))
    return fail("demo", "Not sent: demo mode only allows emails to approved test addresses.");

  const knowledge = await loadKnowledge(db);
  const text = `${d.body_text.trim()}\n\n${knowledge.signature ?? defaultSignature(ownerName)}`;

  let sentId: string | null = null;
  let threadId: string | null = email.provider_thread_id;
  try {
    const res = await fetch(process.env.GMAIL_SEND_WEBHOOK_URL!, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-webhook-secret": process.env.GMAIL_SEND_SECRET!,
        "Idempotency-Key": `draft:${draftId}`,
      },
      body: JSON.stringify({
        draft_id: draftId,
        to: email.from_address,
        subject: d.subject,
        body_text: text,
        thread_id: email.provider_thread_id,
        reply_to_message_id: email.provider_message_id,
      }),
      signal: AbortSignal.timeout(25_000),
    });
    const json = (await res.json().catch(() => ({}))) as { id?: string; threadId?: string; error?: string };
    if (!res.ok || !json.id) return fail("failed", json.error || `The Gmail sender replied with an error (${res.status}).`);
    sentId = json.id;
    threadId = json.threadId ?? threadId;
  } catch (e) {
    return fail("failed", e instanceof Error && e.name === "TimeoutError" ? "The Gmail sender took too long to answer." : "Could not reach the Gmail sender.");
  }

  const now = new Date().toISOString();
  // Our reply and its timeline entry join a project only through an explicit link, never an inferred one.
  const projectId = explicitProjectId(email);
  await db.from("email_drafts").update({ status: "sent", sent_at: now, sent_message_id: sentId, error_summary: null }).eq("id", draftId);

  // Keep our own reply in the thread, and close the loop on the original email.
  await db.from("inbox_emails").insert({
    provider: "gmail",
    provider_message_id: sentId,
    provider_thread_id: threadId,
    from_address: (process.env.INBOX_ADDRESS || "business-inbox@unknown.invalid").trim().toLowerCase(),
    from_name: ownerName,
    to_addresses: [email.from_address],
    subject: d.subject,
    received_at: now,
    body_text: text,
    contact_id: email.contact_id,
    project_id: projectId,
    direction: "outbound",
    analysis_status: "skipped",
    status: "handled",
    handled_by: adminId,
    handled_at: now,
  });
  await db
    .from("inbox_emails")
    .update({ status: "handled", handled_by: adminId, handled_at: now })
    .eq("id", email.id)
    .eq("status", "open");

  if (email.contact_id)
    await db.from("events").insert({
      contact_id: email.contact_id,
      project_id: projectId,
      event_type: "email.reply_sent",
      summary: `Replied to ${email.from_name ?? email.from_address}: ${String(d.subject).slice(0, 120)}`,
      details: {},
      actor_user_id: adminId,
      source: "email_assistant",
    });
  return { ok: true };
}
