import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { UserError, loadContext, logEvent } from "./build";
import { syncWonFromContract } from "./project-stage";
import { DOC_NAME, type DocType } from "./vars";

export const MAX_SIGNED_BYTES = 15 * 1024 * 1024;

const dbMessage = (m: string) => m.replace(/^(agreements|agreement_documents): /, "");

// Stores a returned signed PDF as evidence and marks the agreement "returned". It is NOT verified: that is a separate review.
export async function recordSignedReturn(db: SupabaseClient, adminId: string, id: string, file: Buffer) {
  if (file.byteLength === 0) throw new UserError("Choose a signed PDF to upload.");
  if (file.byteLength > MAX_SIGNED_BYTES) throw new UserError("That file is larger than 15 MB.");
  if (file.subarray(0, 5).toString("latin1") !== "%PDF-") throw new UserError("Only PDF files can be uploaded.");

  const { data: a } = await db
    .from("agreements")
    .select("id, project_id, document_type, status, agreement_documents(revision_number, document_kind)")
    .eq("id", id)
    .maybeSingle();
  if (!a) throw new UserError("That agreement could not be found.");
  if (!["generated", "sent", "returned"].includes(a.status))
    throw new UserError("A signed copy can only be uploaded for a generated, sent or returned agreement.");

  const revision =
    Math.max(0, ...(a.agreement_documents as { revision_number: number; document_kind: string }[]).filter((d) => d.document_kind === "signed_return").map((d) => d.revision_number)) + 1;
  const path = `${a.project_id}/${id}/signed-r${revision}.pdf`;
  const up = await db.storage.from("agreements").upload(path, file, { contentType: "application/pdf", upsert: false });
  if (up.error) throw up.error;

  const doc = await db.from("agreement_documents").insert({
    agreement_id: id,
    document_kind: "signed_return",
    revision_number: revision,
    storage_path: path,
    sha256: createHash("sha256").update(file).digest("hex"),
    mime_type: "application/pdf",
    size_bytes: file.byteLength,
    uploaded_by: adminId,
  });
  if (doc.error) throw new UserError(dbMessage(doc.error.message));

  if (a.status !== "returned") {
    const st = await db.from("agreements").update({ status: "returned" }).eq("id", id);
    if (st.error) throw new UserError(dbMessage(st.error.message));
  }
  await logEvent(db, await loadContext(db, a.project_id), id, adminId, "agreement.signed_uploaded", `Signed ${DOC_NAME[a.document_type as DocType]} uploaded for review (copy ${revision})`);
}

// The explicit review step: records who verified the latest signed copy and why, then marks the agreement verified.
export async function verifySigned(db: SupabaseClient, adminId: string, id: string, note: string) {
  const text = note.trim();
  if (!text) throw new UserError("Write a short note about what you checked before verifying.");

  const { data: a } = await db
    .from("agreements")
    .select("id, project_id, document_type, status, agreement_documents(id, document_kind, revision_number, verified_at)")
    .eq("id", id)
    .maybeSingle();
  if (!a) throw new UserError("That agreement could not be found.");
  // Already verified (double click, retry): nothing new to record. For a work contract, finish the project stage if a
  // previous attempt was interrupted before it; a policy and liability agreement never changes the stage.
  if (a.status === "verified") {
    if (a.document_type === "work_contract") await syncWonFromContract(db, await loadContext(db, a.project_id), adminId);
    return;
  }
  if (a.status !== "returned") throw new UserError("There is no returned signed copy waiting for review.");

  const docs = (a.agreement_documents as { id: string; document_kind: string; revision_number: number; verified_at: string | null }[])
    .filter((d) => d.document_kind === "signed_return")
    .sort((x, y) => y.revision_number - x.revision_number);
  const latest = docs[0];
  if (!latest) throw new UserError("There is no signed copy to verify.");

  const now = new Date().toISOString();
  if (!latest.verified_at) {
    const d = await db
      .from("agreement_documents")
      .update({ verified_by: adminId, verified_at: now, verification_note: text })
      .eq("id", latest.id);
    if (d.error) throw new UserError(dbMessage(d.error.message));
  }
  // Only the request that actually flips returned -> verified writes the history entry.
  const ag = await db.from("agreements").update({ status: "verified", verified_by: adminId, verified_at: now }).eq("id", id).eq("status", "returned").select("id");
  if (ag.error) throw new UserError(dbMessage(ag.error.message));
  const ctx = await loadContext(db, a.project_id);
  if (ag.data && ag.data.length > 0)
    await logEvent(db, ctx, id, adminId, "agreement.verified", `Signed ${DOC_NAME[a.document_type as DocType]} reviewed and verified`);
  if (a.document_type === "work_contract") await syncWonFromContract(db, ctx, adminId);
}
