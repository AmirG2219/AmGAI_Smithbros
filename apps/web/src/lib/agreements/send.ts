import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendRecordedEmail } from "@/lib/email/record";
import { emailEnabled } from "@/lib/email/resend";
import { plainEmail } from "@/lib/email/templates";
import { logEvent } from "./build";
import { advanceStage } from "./project-stage";

export const DOC_LABEL: Record<string, string> = {
  work_contract: "work contract",
  policy_liability: "policy and liability agreement",
};

export type SendOutcome = "sent" | "blocked" | "skipped" | "failed" | "invalid";

// Sending stays off until email is configured and every document uses an approved, non-placeholder template.
export function sendBlockers(templateNames: string[]): string[] {
  const out: string[] = [];
  if (!emailEnabled()) out.push("Email sending is not configured yet (Resend key, sender address and EMAIL_SENDING_ENABLED).");
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

// Emails one or more generated documents of the same project (PDFs attached) and records everything: the message,
// the attachment links the database requires before an agreement may be "sent", the status changes and timeline events.
// With reminder = true it re-sends the PDFs of agreements that are already sent, as a reminder.
export async function sendAgreementsEmail(
  db: SupabaseClient,
  adminId: string,
  agreementIds: string[],
  input: { to: string; subject: string; body: string },
  reminder = false,
): Promise<{ outcome: SendOutcome; projectId: string | null }> {
  const { data } = await db
    .from("agreements")
    .select(
      "id, status, document_type, project_id, agreement_documents(id, document_kind, storage_path), agreement_template_versions(agreement_templates(name))",
    )
    .in("id", agreementIds);
  const rows = (data ?? []) as unknown as Row[];
  const projectId = rows[0]?.project_id ?? null;
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

  const attachments: { filename: string; content: Buffer }[] = [];
  for (const { row, doc } of docs) {
    const file = await db.storage.from("agreements").download(doc!.storage_path);
    if (file.error) return { outcome: "failed", projectId };
    attachments.push({
      filename: `Smith-Bros-${(DOC_LABEL[row.document_type] ?? "document").replace(/\s+/g, "-")}.pdf`,
      content: Buffer.from(await file.data.arrayBuffer()),
    });
  }

  const ctx = { contactId: project.contact_id as string, projectId: projectId! };
  const r = await sendRecordedEmail({
    db,
    contactId: ctx.contactId,
    projectId,
    to,
    mail: plainEmail({ subject, body, signature: "Smith Bros Floors" }),
    idempotencyKey: `agreement-send:${agreementIds.join("+")}:${randomUUID()}`, // each send is its own delivery
    beforeDelivery: async (messageId) => {
      const link = await db
        .from("message_attachments")
        .insert(docs.map(({ doc }) => ({ message_id: messageId, agreement_document_id: doc!.id })));
      if (link.error) throw link.error;
    },
    attachments,
  });

  const kind = reminder ? "reminder" : "send";
  if (r.status !== "sent") {
    for (const { row } of docs)
      await logEvent(
        db,
        ctx,
        row.id,
        adminId,
        `agreement.${kind}_${r.status}`,
        r.status === "skipped"
          ? `The ${DOC_LABEL[row.document_type]} was not emailed: ${r.reason}`
          : `The ${DOC_LABEL[row.document_type]} could not be emailed`,
      );
    return { outcome: r.status, projectId };
  }

  for (const { row } of docs) {
    if (row.status === "generated") {
      const up = await db.from("agreements").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", row.id);
      if (up.error) throw up.error;
    }
    await logEvent(
      db,
      ctx,
      row.id,
      adminId,
      reminder ? "agreement.reminder_sent" : "agreement.sent",
      `${reminder ? "Reminder about the" : "The"} ${DOC_LABEL[row.document_type]} ${reminder ? "emailed" : "was emailed"} to ${to}${docs.length > 1 && !reminder ? " together with the other document" : ""}`,
    );
  }
  // Only a sent work contract moves the project on; a policy and liability agreement alone does not. Repeats are harmless.
  // The email is already delivered and recorded, so a failure here must not be reported as a failed send; it is logged
  // and the next send or reminder of the contract repeats the step.
  if (docs.some(({ row }) => row.document_type === "work_contract"))
    try {
      await advanceStage(db, ctx, adminId, "agreement_sent", "the work contract was emailed to the customer", {
        agreement_ids: docs.filter(({ row }) => row.document_type === "work_contract").map(({ row }) => row.id),
      });
    } catch (e) {
      console.error("[agreements] project stage not updated after send:", e);
    }
  return { outcome: "sent", projectId };
}
