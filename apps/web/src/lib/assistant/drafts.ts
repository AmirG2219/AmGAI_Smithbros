import type { SupabaseClient } from "@supabase/supabase-js";
import { loadLeadForEmail } from "@/lib/leads/email-context";
import { leadFacts } from "@/lib/leads/email-draft";
import { allChecks, draftReply, lintDraft, replyAiEnabled, type ThreadMessage } from "./draft";
import { loadKnowledge } from "./knowledge";
import { loadLearning } from "./learning";

type EmailRow = {
  id: string;
  from_address: string;
  from_name: string | null;
  subject: string;
  body_text: string;
  provider_thread_id: string | null;
  received_at: string;
  contact_id: string | null;
  project_id: string | null;
  direction: "inbound" | "outbound";
};

const COLUMNS = "id, from_address, from_name, subject, body_text, provider_thread_id, received_at, contact_id, project_id, direction";

const rePrefix = (s: string) => (/^re:/i.test(s) ? s : `Re: ${s || "your email"}`);
const firstName = (e: EmailRow) => (e.from_name ?? e.from_address.split("@")[0]).split(/\s+/)[0].replace(/[^\p{L}'-]/gu, "") || "there";

export async function loadThread(db: SupabaseClient, email: EmailRow): Promise<EmailRow[]> {
  if (!email.provider_thread_id) return [email];
  const { data } = await db
    .from("inbox_emails")
    .select(COLUMNS)
    .eq("provider_thread_id", email.provider_thread_id)
    .order("received_at", { ascending: true })
    .limit(30);
  return (data as EmailRow[] | null)?.length ? (data as EmailRow[]) : [email];
}

// Writes (or rewrites) the one open draft for an inbound email. With an OpenAI key the draft is grounded in our
// records and the owner's standard answers; without one it is a blank reply for the owner to write.
export async function createOrRefreshDraft(db: SupabaseClient, emailId: string, instruction?: string) {
  const { data: email } = await db.from("inbox_emails").select(COLUMNS).eq("id", emailId).single();
  if (!email) throw new Error("Email not found");
  const e = email as EmailRow;
  if (e.direction !== "inbound") throw new Error("Only inbound emails can be replied to");

  const thread = await loadThread(db, e);
  const lead = e.project_id ? await loadLeadForEmail(db, e.project_id) : null;
  const facts = lead ? leadFacts(lead.ctx) : null;
  const knowledge = await loadKnowledge(db);
  const learning = replyAiEnabled() ? await loadLearning(db) : undefined;

  let subject = rePrefix(e.subject);
  let body = `Hi ${firstName(e)},\n\n`;
  let checks: string[] = [];
  let source: "ai" | "manual" = "manual";
  let model: string | null = null;
  let aiBody: string | null = null;

  if (replyAiEnabled()) {
    const messages: ThreadMessage[] = thread.map((m) => ({
      direction: m.direction,
      who: m.from_name ?? m.from_address,
      date: new Date(m.received_at).toLocaleString("en-CA", { timeZone: "America/Edmonton", dateStyle: "medium", timeStyle: "short" }),
      text: m.body_text,
    }));
    const d = await draftReply({
      originalSubject: e.subject,
      thread: messages,
      facts,
      knowledge,
      instruction,
      bookingUrl: process.env.CALENDLY_URL || null,
      learning,
    });
    // Everything the draft was allowed to rely on; anything else it states gets flagged.
    const sources = [
      ...thread.map((m) => m.body_text),
      facts ?? "",
      ...knowledge.faqs.map((f) => `${f.title ?? ""} ${f.content}`),
      ...knowledge.rules,
      instruction ?? "",
      process.env.CALENDLY_URL ?? "",
    ].join("\n");
    subject = d.subject;
    body = d.body;
    aiBody = d.body;
    checks = allChecks(d.needsInput, lintDraft(d.body, sources));
    source = "ai";
    model = d.model;
  }

  const fields = { subject, body_text: body, ai_body_text: aiBody, checks, source, model, status: "draft", approved_by: null, approved_at: null, error_summary: null };
  const { data: open } = await db.from("email_drafts").select("id").eq("email_id", emailId).in("status", ["draft", "approved", "failed"]).maybeSingle();
  if (open) {
    const { error } = await db.from("email_drafts").update(fields).eq("id", open.id);
    if (error) throw error;
    return { draftId: open.id as string, source };
  }
  const { data: created, error } = await db.from("email_drafts").insert({ email_id: emailId, ...fields }).select("id").single();
  if (error) throw error;
  return { draftId: created.id as string, source };
}
