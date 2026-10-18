import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendRecordedEmail } from "@/lib/email/record";
import { emailEnabled } from "@/lib/email/resend";
import { plainEmail } from "@/lib/email/templates";

export const DOC_LABEL: Record<string, string> = {
  work_contract: "contract",
  policy_liability: "policy and liability agreement",
};

export type SendOutcome = "sent" | "email-off" | "skipped" | "failed" | "invalid";

export function defaultMessage(firstName: string, docType: string) {
  return `Hi ${firstName},\n\nPlease find your ${DOC_LABEL[docType] ?? "document"} attached. Take a look and let us know if you have any questions or would like anything changed.\n\nOnce you are happy with it, please sign it and send it back to us.`;
}

// Emails a generated document (PDF attached) to the client and records it: the message, the attachment link
// the database requires before an agreement may be marked "sent", the status change, and a timeline event.
export async function sendAgreementEmail(
  db: SupabaseClient,
  adminId: string,
  agreementId: string,
  input: { to: string; subject: string; body: string },
): Promise<{ outcome: SendOutcome; projectId: string | null }> {
  const { data: ag } = await db
    .from("agreements")
    .select(
      "id, status, document_type, project_id, projects(contact_id, contacts(first_name)), agreement_documents(id, document_kind, storage_path)",
    )
    .eq("id", agreementId)
    .maybeSingle();
  if (!ag) return { outcome: "invalid", projectId: null };

  const project = Array.isArray(ag.projects) ? ag.projects[0] : ag.projects;
  const doc = (ag.agreement_documents as { id: string; document_kind: string; storage_path: string }[]).find(
    (d) => d.document_kind === "generated",
  );
  const to = input.to.trim().toLowerCase();
  const subject = input.subject.trim();
  const body = input.body.trim();
  if (!project || !doc || !["generated", "sent"].includes(ag.status) || !/^\S+@\S+\.\S+$/.test(to) || !subject || !body)
    return { outcome: "invalid", projectId: ag.project_id };

  if (!emailEnabled()) return { outcome: "email-off", projectId: ag.project_id };

  const file = await db.storage.from("agreements").download(doc.storage_path);
  if (file.error) return { outcome: "failed", projectId: ag.project_id };
  const pdf = Buffer.from(await file.data.arrayBuffer());

  const event = (event_type: string, summary: string) =>
    db.from("events").insert({
      contact_id: project.contact_id,
      project_id: ag.project_id,
      event_type,
      summary,
      details: { agreement_id: ag.id },
      actor_user_id: adminId,
      source: "dashboard",
    });
  const label = DOC_LABEL[ag.document_type] ?? "document";

  const r = await sendRecordedEmail({
    db,
    contactId: project.contact_id,
    projectId: ag.project_id,
    to,
    mail: plainEmail({ subject, body, signature: "Smith Bros Floors" }),
    idempotencyKey: `agreement-send:${ag.id}:${randomUUID()}`, // each send (including a resend) is its own delivery
    beforeDelivery: async (messageId) => {
      const link = await db.from("message_attachments").insert({ message_id: messageId, agreement_document_id: doc.id });
      if (link.error) throw link.error;
    },
    attachments: [{ filename: `Smith Bros ${label}.pdf`.replace(/\s+/g, "-"), content: pdf }],
  });

  if (r.status !== "sent") {
    await event(
      `agreement.send_${r.status}`,
      r.status === "skipped" ? `The ${label} was not emailed: ${r.reason}` : `The ${label} could not be emailed`,
    );
    return { outcome: r.status, projectId: ag.project_id };
  }

  if (ag.status === "generated") {
    const up = await db.from("agreements").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", ag.id);
    if (up.error) throw up.error;
  }
  await event("agreement.sent", `The ${label} was emailed to ${to}`);
  return { outcome: "sent", projectId: ag.project_id };
}
