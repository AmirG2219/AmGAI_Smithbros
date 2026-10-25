import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendRecordedEmailDetailed } from "@/lib/email/record";
import { replyToAddress, replyToConfigured } from "@/lib/email/reply-to";
import { emailEnabled } from "@/lib/email/resend";
import { plainEmail } from "@/lib/email/templates";
import { logEvent } from "./build";
import { advanceStage } from "./project-stage";

export const DOC_LABEL: Record<string, string> = {
  work_contract: "work contract",
  policy_liability: "policy and liability agreement",
};

export type SendOutcome = "sent" | "blocked" | "skipped" | "failed" | "invalid" | "uncertain" | "unrecorded" | "recovered" | "duplicate";

// Sending stays off until email is configured and every document uses an approved, non-placeholder template.
export function sendBlockers(templateNames: string[]): string[] {
  const out: string[] = [];
  if (!emailEnabled()) out.push("Email sending is not configured yet (Resend key, sender address and EMAIL_SENDING_ENABLED).");
  if (!replyToConfigured())
    out.push("The company inbox address (INBOX_ADDRESS) is not set or is not a valid email address, so the customer's reply would have nowhere to go.");
  if (templateNames.some((n) => /placeholder/i.test(n)))
    out.push("The approved template is still placeholder wording. Replace it with Smith Bros' approved legal text before sending to customers.");
  return out;
}

const names = (docTypes: string[]) =>
  docTypes.length > 1 ? "policy and liability agreement and work contract" : (DOC_LABEL[docTypes[0]] ?? "document");

export function defaultMessage(firstName: string, docTypes: string[]) {
  const both = docTypes.length > 1;
  return `Hi ${firstName},\n\nPlease find your ${names(docTypes)} attached. Take a look and let us know if you have any questions or would like anything changed.\n\nTo sign, open ${both ? "each PDF" : "the PDF"} in your PDF app (or print, sign and scan or photograph it) and reply to this email with the signed ${both ? "copies" : "copy"}.`;
}

export function defaultReminder(firstName: string, docTypes: string[]) {
  return `Hi ${firstName},\n\nA quick reminder that we are still waiting for your signed ${names(docTypes)}. A copy is attached again for convenience.\n\nPlease reply to this email with the signed ${docTypes.length > 1 ? "copies" : "copy"} when you can, or let us know if you have any questions.`;
}

type Doc = { id: string; document_kind: string; storage_path: string };
type Row = {
  id: string;
  status: string;
  document_type: string;
  project_id: string;
  agreement_documents: Doc[];
  agreement_template_versions: { agreement_templates: { name: string } | { name: string }[] | null } | null;
};

const tplName = (r: Row) => {
  const t = r.agreement_template_versions?.agreement_templates;
  return (Array.isArray(t) ? t[0]?.name : t?.name) ?? "";
};

// ---- Send attempts: what the records say about earlier emails of a document ----

// One delivery attempt, read from message_deliveries through the message that carries the document as an attachment.
export type Attempt = { key: string; status: string; acceptedAt: string | null; createdAt: string; providerId: string | null };

const PREFIX = "agreement-send:";

type AttemptRow = {
  messages:
    | { message_deliveries: { idempotency_key: string; status: string; accepted_at: string | null; created_at: string; provider_message_id: string | null }[] | null }
    | { message_deliveries: { idempotency_key: string; status: string; accepted_at: string | null; created_at: string; provider_message_id: string | null }[] | null }[]
    | null;
};

export async function loadSendAttempts(db: SupabaseClient, documentIds: string[]): Promise<Attempt[]> {
  const { data, error } = await db
    .from("message_attachments")
    .select("messages(message_deliveries(idempotency_key, status, accepted_at, created_at, provider_message_id))")
    .in("agreement_document_id", documentIds);
  if (error) throw error;
  const out = new Map<string, Attempt>();
  for (const row of (data ?? []) as unknown as AttemptRow[]) {
    const m = Array.isArray(row.messages) ? row.messages[0] : row.messages;
    for (const d of m?.message_deliveries ?? [])
      if (d.idempotency_key.startsWith(PREFIX))
        out.set(d.idempotency_key, { key: d.idempotency_key, status: d.status, acceptedAt: d.accepted_at, createdAt: d.created_at, providerId: d.provider_message_id });
  }
  return [...out.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

// What staff should be told about an agreement's emails, from the records alone. "Accepted" means the email provider took the
// email; "delivered" is claimed only when the delivery record itself says delivered (it is set only from provider evidence).
export type SendState =
  | { kind: "none" }
  | { kind: "uncertain"; at: string } // an attempt has no recorded outcome: staff attention required, no blind resend
  | { kind: "unrecorded"; at: string } // accepted by the provider but the agreement was never marked sent
  | { kind: "accepted"; at: string; delivered: boolean }
  | { kind: "rejected"; at: string };

export function summarizeSends(attempts: Attempt[], agreementStatus: string): SendState {
  const queued = attempts.find((a) => a.status === "queued");
  if (queued) return { kind: "uncertain", at: queued.createdAt };
  const accepted = attempts.find((a) => a.acceptedAt);
  if (accepted && agreementStatus === "generated") return { kind: "unrecorded", at: accepted.acceptedAt! };
  const last = attempts[0];
  if (!last) return { kind: "none" };
  if (last.acceptedAt) return { kind: "accepted", at: last.acceptedAt, delivered: last.status === "delivered" };
  return { kind: "rejected", at: last.createdAt };
}

// Runs a write, retrying once. A thrown error counts as a failed write.
async function persisted(write: () => PromiseLike<{ error: unknown }>): Promise<boolean> {
  for (let i = 0; i < 2; i++) {
    try {
      if (!(await write()).error) return true;
    } catch {
      /* try once more */
    }
  }
  return false;
}

// Emails one or more generated documents of the same project (PDFs attached) and records everything: the message,
// the attachment links the database requires before an agreement may be "sent", the status changes and timeline events.
// With reminder = true it re-sends the PDFs of agreements that are already sent, as a reminder.
//
// It never throws, and its outcome says exactly what happened:
//   sent       the provider accepted the email and every record was saved
//   unrecorded the provider accepted it but a record could not be saved: do NOT send again, staff attention is needed
//   recovered  an earlier accepted email had not been recorded; it is recorded now and NOTHING is sent again
//   uncertain  an attempt has no recorded outcome (or just got none): nothing is sent until staff have checked
//   duplicate  this exact request was already processed
//   failed     the provider refused it, or it could not be prepared: nothing was sent
//   skipped / blocked / invalid  as before: nothing was sent
//
// `attemptKey` identifies one opening of the send form, so a double click or a repeated request is one attempt. Each retry
// after a refusal gets the next attempt number. `confirmedNotSent` lets staff send after an "uncertain" attempt, and marks
// that attempt as failed by staff decision.
export async function sendAgreementsEmail(
  db: SupabaseClient,
  adminId: string,
  agreementIds: string[],
  input: { to: string; subject: string; body: string },
  reminder = false,
  opts: { attemptKey?: string; confirmedNotSent?: boolean } = {},
): Promise<{ outcome: SendOutcome; projectId: string | null }> {
  let projectId: string | null = null;
  try {
    const { data } = await db
      .from("agreements")
      .select(
        "id, status, document_type, project_id, agreement_documents(id, document_kind, storage_path), agreement_template_versions(agreement_templates(name))",
      )
      .in("id", agreementIds);
    const rows = (data ?? []) as unknown as Row[];
    projectId = rows[0]?.project_id ?? null;
    const allowed = reminder ? ["sent"] : ["generated", "sent"];

    const to = input.to.trim().toLowerCase();
    const subject = input.subject.trim();
    const body = input.body.trim();
    if (
      rows.length === 0 ||
      rows.length !== new Set(agreementIds).size ||
      rows.some((r) => r.project_id !== projectId || !allowed.includes(r.status)) ||
      !/^\S+@\S+\.\S+$/.test(to) ||
      !subject ||
      !body
    )
      return { outcome: "invalid", projectId };

    if (sendBlockers(rows.map(tplName)).length) return { outcome: "blocked", projectId };

    const docs = rows.map((r) => ({ row: r, doc: r.agreement_documents.find((d) => d.document_kind === "generated") }));
    if (docs.some((d) => !d.doc)) return { outcome: "invalid", projectId };

    const { data: project } = await db.from("projects").select("contact_id").eq("id", projectId).single();
    if (!project) return { outcome: "invalid", projectId };
    const ctx = { contactId: project.contact_id as string, projectId: projectId! };

    // What do the records already say? A refusal is safe to retry; an accepted-but-unrecorded or unknown attempt is not.
    const attempts = await loadSendAttempts(db, docs.map((d) => d.doc!.id));
    const idsKey = [...agreementIds].sort().join("+");
    const base = opts.attemptKey?.trim() ? opts.attemptKey.trim().slice(0, 80) : `auto-${randomUUID()}`;
    const prefix = `${PREFIX}${idsKey}:${base}:`;
    const sameRequest = attempts.filter((a) => a.key.startsWith(prefix));

    // A recovery sends nothing, so it leaves no delivery to key on: the timeline entry carries the request key instead.
    if (opts.attemptKey?.trim()) {
      const handled = await db.from("events").select("id").eq("event_type", "agreement.send_recovered").eq("details->>send_key", base).limit(1);
      if (handled.data && handled.data.length > 0) return { outcome: "duplicate", projectId };
    }

    const accepted = attempts.find((a) => a.acceptedAt);
    const needsRecording = docs.filter(({ row }) => row.status === "generated");
    if (!reminder && accepted && needsRecording.length > 0) {
      // An earlier email was accepted but the agreement never became "sent". Record that; do not email again.
      const ok = await recordSent(db, ctx, adminId, needsRecording, accepted.acceptedAt!, null, accepted.providerId, "recovered", undefined, base);
      return { outcome: ok ? "recovered" : "unrecorded", projectId };
    }
    if (sameRequest.some((a) => a.acceptedAt)) return { outcome: "duplicate", projectId };

    const unknown = attempts.filter((a) => a.status === "queued");
    if (unknown.length > 0) {
      if (!opts.confirmedNotSent) return { outcome: "uncertain", projectId };
      // Staff checked and confirmed the earlier attempt was not sent: say so on the record, then allow a new attempt.
      for (const a of unknown) {
        const now = new Date().toISOString();
        const upd = await persisted(() =>
          db
            .from("message_deliveries")
            .update({ status: "failed", failed_at: now, error_code: "staff_confirmed_not_sent", error_summary: "Marked as not sent by a staff member after checking the email provider's records. This is a staff statement, not evidence from the provider." })
            .eq("idempotency_key", a.key)
            .eq("status", "queued"),
        );
        if (!upd) return { outcome: "failed", projectId }; // nothing sent
      }
      for (const { row } of docs) await logEvent(db, ctx, row.id, adminId, "agreement.send_override", `A staff member stated, after checking the email provider's records, that the earlier ${DOC_LABEL[row.document_type]} email attempt was not sent, and sent it again. This is the staff member's statement, not confirmation from the provider.`);
    }

    const attachments: { filename: string; content: Buffer }[] = [];
    for (const { row, doc } of docs) {
      const file = await db.storage.from("agreements").download(doc!.storage_path);
      if (file.error) return { outcome: "failed", projectId };
      attachments.push({
        filename: `Smith-Bros-${(DOC_LABEL[row.document_type] ?? "document").replace(/\s+/g, "-")}.pdf`,
        content: Buffer.from(await file.data.arrayBuffer()),
      });
    }

    const r = await sendRecordedEmailDetailed({
      db,
      contactId: ctx.contactId,
      projectId,
      to,
      mail: plainEmail({ subject, body, signature: "Smith Bros Floors" }),
      idempotencyKey: `${prefix}${sameRequest.length + 1}`, // the same request is one attempt; each retry after a refusal is the next
      beforeDelivery: async (messageId) => {
        const link = await db
          .from("message_attachments")
          .insert(docs.map(({ doc }) => ({ message_id: messageId, agreement_document_id: doc!.id })));
        if (link.error) throw link.error;
      },
      replyTo: replyToAddress(),
      attachments,
    });

    const kind = reminder ? "reminder" : "send";
    if (r.status === "duplicate") return { outcome: "duplicate", projectId };
    if (r.status === "no_reply_to") return { outcome: "blocked", projectId };
    if (r.status === "skipped") {
      for (const { row } of docs)
        await logEvent(db, ctx, row.id, adminId, `agreement.${kind}_skipped`, `The ${DOC_LABEL[row.document_type]} was not emailed: ${r.reason}`);
      return { outcome: "skipped", projectId };
    }
    if (r.status === "rejected") {
      for (const { row } of docs)
        await logEvent(db, ctx, row.id, adminId, `agreement.${kind}_failed`, `The ${DOC_LABEL[row.document_type]} was not emailed: the email provider refused it (${r.code}). Nothing was sent.`);
      return { outcome: "failed", projectId };
    }
    if (r.status === "uncertain") {
      for (const { row } of docs)
        await logEvent(db, ctx, row.id, adminId, `agreement.${kind}_uncertain`, `The ${DOC_LABEL[row.document_type]} may or may not have been emailed: the email provider gave no definite answer (${r.code}). Staff attention required; do not send again until this is checked.`);
      return { outcome: "uncertain", projectId };
    }

    // The provider accepted the email. From here nothing may be reported as a failed send.
    const ok = await recordSent(
      db,
      ctx,
      adminId,
      docs,
      new Date().toISOString(),
      reminder ? null : `emailed to ${to}${docs.length > 1 ? " together with the other document" : ""}`,
      r.providerId,
      reminder ? "reminder" : "sent",
      to,
    );
    return { outcome: ok && r.recorded ? "sent" : "unrecorded", projectId };
  } catch (e) {
    // Every throw above happens before the provider is called, so nothing was sent.
    console.error("[agreements] send failed before reaching the email provider:", e);
    return { outcome: "failed", projectId };
  }
}

// Saves what an accepted email means: agreements become "sent", the timeline says so (plainly: accepted by the provider, not
// confirmed delivered) and a sent work contract moves the project on. Every write is retried once; false means something is missing.
async function recordSent(
  db: SupabaseClient,
  ctx: { contactId: string; projectId: string },
  adminId: string,
  docs: { row: Row }[],
  at: string,
  detail: string | null,
  providerId: string | null,
  mode: "sent" | "recovered" | "reminder",
  to?: string,
  sendKey?: string,
): Promise<boolean> {
  let ok = true;
  for (const { row } of docs) {
    if (row.status === "generated" && mode !== "reminder") {
      const up = await persisted(() => db.from("agreements").update({ status: "sent", sent_at: at }).eq("id", row.id).eq("status", "generated"));
      if (!up) ok = false;
    }
    const label = DOC_LABEL[row.document_type];
    const summary =
      mode === "reminder"
        ? `Reminder about the ${label} emailed to ${to} (accepted by the email provider; delivery is not confirmed)`
        : mode === "recovered"
          ? `The ${label} had already been emailed (accepted by the email provider on ${at}); its status has now been recorded. It was not sent again.`
          : `The ${label} was ${detail} (accepted by the email provider; delivery is not confirmed)`;
    const eventType = mode === "reminder" ? "agreement.reminder_sent" : mode === "recovered" ? "agreement.send_recovered" : "agreement.sent";
    if (!(await logEvent(db, ctx, row.id, adminId, eventType, summary, { provider_message_id: providerId, ...(sendKey ? { send_key: sendKey } : {}) }))) ok = false;
  }
  if (!ok)
    for (const { row } of docs)
      await logEvent(db, ctx, row.id, adminId, "agreement.send_unrecorded", `The ${DOC_LABEL[row.document_type]} email was accepted by the email provider but some records could not be saved. Do not send it again; staff attention required.`, { provider_message_id: providerId });
  // Only a sent work contract moves the project on; a policy and liability agreement alone does not. Repeats are harmless.
  // The email is already out and recorded, so a failure here is logged and the next send or reminder repeats the step.
  if (ok && docs.some(({ row }) => row.document_type === "work_contract"))
    try {
      await advanceStage(db, ctx, adminId, "agreement_sent", "the work contract was emailed to the customer", {
        agreement_ids: docs.filter(({ row }) => row.document_type === "work_contract").map(({ row }) => row.id),
      });
    } catch (e) {
      console.error("[agreements] project stage not updated after send:", e);
    }
  return ok;
}
