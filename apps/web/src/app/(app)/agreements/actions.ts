"use server";

import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  UserError,
  type PossibleMatch,
  cancelAgreement,
  createDrafts,
  createManualProject,
  findOrCreateCustomer,
  generateDocument,
  reviseAgreement,
  updateDraft,
} from "@/lib/agreements/build";
import { sendAgreementsEmail } from "@/lib/agreements/send";
import { verifySigned } from "@/lib/agreements/review";
import { EMPTY_INPUTS, parseQuoteEntry, type DocType, type Inputs } from "@/lib/agreements/vars";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

const readInputs = (f: FormData): Inputs => ({
  ...EMPTY_INPUTS,
  ...Object.fromEntries(Object.keys(EMPTY_INPUTS).map((k) => [k, str(f, k)])),
});

const DOCS: Record<string, DocType[]> = {
  policy: ["policy_liability"],
  contract: ["work_contract"],
  both: ["policy_liability", "work_contract"],
};

// Runs a step; a UserError becomes a message on the given page, anything else a generic one (nothing is half-done silently).
async function run(back: string, step: () => Promise<string | void>): Promise<never> {
  let dest: string;
  try {
    dest = (await step()) ?? back;
  } catch (e) {
    if (e instanceof UserError) return redirect(`${back}${back.includes("?") ? "&" : "?"}error=${encodeURIComponent(e.message)}`);
    console.error("[agreements] action failed:", e);
    return redirect(`${back}${back.includes("?") ? "&" : "?"}error=${encodeURIComponent("Something went wrong. Nothing was sent. Please try again.")}`);
  }
  return redirect(dest);
}

export async function createDraftsAction(formData: FormData) {
  const me = await requireAdmin();
  const project = str(formData, "project");
  const docs = DOCS[str(formData, "docs")] ?? [];
  const uuid = (s: string) => (/^[0-9a-f-]{36}$/i.test(s) ? s : "");
  const back = `/agreements/new?customer=${uuid(str(formData, "customer"))}&project=${uuid(project)}&docs=${DOCS[str(formData, "docs")] ? str(formData, "docs") : ""}`;
  await run(back, async () => {
    // Price and scope typed in by staff (only sent when the project has no accepted quote yet).
    let newQuote;
    if (formData.has("q_scope")) {
      const q = parseQuoteEntry({
        scope: formData.get("q_scope"),
        exclusions: formData.get("q_exclusions"),
        subtotal: formData.get("q_subtotal"),
        taxRate: formData.get("q_tax_rate"),
        confirmed: formData.get("q_confirm") === "on",
      });
      if (!q.ok) throw new UserError(q.error);
      newQuote = q.value;
    }
    const ids = await createDrafts(createAdminClient(), me.id, project, docs, readInputs(formData), undefined, newQuote);
    return `/agreements/${ids[0]}?notice=drafted`;
  });
}

// Step 1 inline form: add a customer, or pick the existing one when the email or phone is already on file.
export type CustomerFormState = { error?: string; matches?: PossibleMatch[] } | null;

// An email already on file means the same customer. A phone number already on file only MIGHT be, so staff are asked to
// choose (use that customer, or add a separate one) rather than having one picked for them.
export async function createCustomerAction(_prev: CustomerFormState, formData: FormData): Promise<CustomerFormState> {
  await requireAdmin();
  let dest: string;
  try {
    const r = await findOrCreateCustomer(createAdminClient(), Object.fromEntries(formData), { confirmNew: formData.get("confirm_new") === "1" });
    if (r.kind === "phone_match") return { matches: r.matches };
    dest = `/agreements/new?customer=${r.id}${r.kind === "existing" ? "&notice=existing" : ""}`;
  } catch (e) {
    if (e instanceof UserError) return { error: e.message };
    console.error("[agreements] add customer failed:", e);
    return { error: "Something went wrong. The customer was not added. Please try again." };
  }
  redirect(dest);
}

// Step 2 inline form: add a project for the customer (no website inquiry needed).
export async function createProjectAction(customerId: string, formData: FormData) {
  await requireAdmin();
  if (!/^[0-9a-f-]{36}$/i.test(customerId)) redirect("/agreements/new");
  const base = `/agreements/new?customer=${customerId}`;
  await run(base, async () => {
    const id = await createManualProject(createAdminClient(), customerId, Object.fromEntries(formData));
    return `${base}&project=${id}`;
  });
}

export async function updateDraftAction(id: string, formData: FormData) {
  const me = await requireAdmin();
  await run(`/agreements/${id}/edit`, async () => {
    await updateDraft(createAdminClient(), me.id, id, readInputs(formData));
    return `/agreements/${id}?notice=saved`;
  });
}

export async function generateAction(id: string) {
  const me = await requireAdmin();
  await run(`/agreements/${id}`, async () => {
    await generateDocument(createAdminClient(), me.id, id);
    return `/agreements/${id}?notice=generated`;
  });
}

export async function reviseAction(id: string) {
  const me = await requireAdmin();
  await run(`/agreements/${id}`, async () => `/agreements/${await reviseAgreement(createAdminClient(), me.id, id)}/edit?notice=revision`);
}

export async function cancelAction(id: string) {
  const me = await requireAdmin();
  await run(`/agreements/${id}`, async () => {
    await cancelAgreement(createAdminClient(), me.id, id);
    return `/agreements/${id}?notice=cancelled`;
  });
}

export async function verifyAction(id: string, formData: FormData) {
  const me = await requireAdmin();
  await run(`/agreements/${id}`, async () => {
    if (formData.get("confirm") !== "on") throw new UserError("Tick the box to confirm you have reviewed the signed copy.");
    await verifySigned(createAdminClient(), me.id, id, str(formData, "note"));
    return `/agreements/${id}?notice=verified`;
  });
}

// Sends this document, and optionally its sibling from the same project, in one email. Also used for reminders.
export async function sendAction(id: string, reminder: boolean, formData: FormData) {
  const me = await requireAdmin();
  const ids = [id, ...formData.getAll("also").map(String).filter((x) => /^[0-9a-f-]{36}$/i.test(x))];
  const back = `/agreements/${id}`;
  let outcome: string;
  try {
    ({ outcome } = await sendAgreementsEmail(
      createAdminClient(),
      me.id,
      ids,
      { to: str(formData, "to"), subject: str(formData, "subject"), body: str(formData, "body") },
      reminder,
      // One opening of the send form is one attempt, so a double click or a repeated request cannot email twice.
      { attemptKey: str(formData, "send_key"), confirmedNotSent: formData.get("confirm_resend") === "on" },
    ));
  } catch (e) {
    // sendAgreementsEmail does not throw; this is a safety net, and an unexpected error is never reported as "nothing was sent".
    console.error("[agreements] send crashed:", e);
    outcome = "uncertain";
  }
  redirect(`${back}?notice=${reminder ? "reminder" : "send"}-${outcome}`);
}

// A time-limited link to the PDF in private storage, to copy and share. Never a public file.
export async function secureLinkAction(documentId: string): Promise<{ url?: string; error?: string }> {
  await requireAdmin();
  const db = createAdminClient();
  const { data: d } = await db.from("agreement_documents").select("storage_path").eq("id", documentId).maybeSingle();
  if (!d) return { error: "Document not found." };
  const s = await db.storage.from("agreements").createSignedUrl(d.storage_path, 7 * 24 * 3600);
  return s.error ? { error: "Could not create the link." } : { url: s.data.signedUrl };
}
