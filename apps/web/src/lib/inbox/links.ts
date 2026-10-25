import type { SupabaseClient } from "@supabase/supabase-js";

// How Inbox mail is tied to Contacts, using the existing inbox_emails.contact_id column.
//
// Contact: the sender's address matched a client's address exactly (done when the mail arrives, or when staff press "Create contact").
//
// Project: an email does not say which project it is about, not even for a customer who has only one. Earlier versions of the
// app filled inbox_emails.project_id with the customer's latest project, and the table has no marker that tells such a guess from
// a deliberate link. So no stored project_id is treated as verified: it is ignored everywhere a project is shown or acted on.
// (Explicit links made by business workflows live in conversations/messages and events, which are not touched.)
// When a deliberate way of linking mail to a project exists, this is the one place that decides which links count.
export const explicitProjectId = (email: { project_id?: string | null }): string | null => (email ? null : null);

// Rows as they are shown or acted on: any stored project link is removed.
export const withoutInferredProjects = <T extends { project_id: string | null }>(rows: T[]): T[] => rows.map((r) => (r.project_id ? { ...r, project_id: explicitProjectId(r) } : r));

export type ConversationSummary = {
  key: string;
  emailId: string; // the newest message: opens the conversation in the Inbox (/inbox?e=<id>)
  subject: string;
  messages: number;
  lastAt: string;
  lastDirection: "inbound" | "outbound";
  needsAttention: boolean; // newest message is from the customer and still open
  href: string;
};

type MailRow = { id: string; direction: "inbound" | "outbound"; subject: string; received_at: string; provider_thread_id: string | null; status: string };

// Groups messages into conversations by their mail thread (a message with no thread is its own conversation). Each message counts once.
export function groupConversations(rows: MailRow[]): ConversationSummary[] {
  const seen = new Set<string>();
  const groups = new Map<string, MailRow[]>();
  for (const r of rows) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    const key = r.provider_thread_id ? `t:${r.provider_thread_id}` : `m:${r.id}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  return [...groups.entries()]
    .map(([key, msgs]) => {
      const sorted = [...msgs].sort((a, b) => b.received_at.localeCompare(a.received_at));
      const last = sorted[0];
      return {
        key,
        emailId: last.id,
        subject: last.subject || "(no subject)",
        messages: sorted.length,
        lastAt: last.received_at,
        lastDirection: last.direction,
        needsAttention: last.direction === "inbound" && last.status === "open",
        href: `/inbox?e=${last.id}`,
      };
    })
    .sort((a, b) => b.lastAt.localeCompare(a.lastAt));
}

// Conversations tied to a contact. `db` must be the signed-in user's client so row security limits this to active admins.
export async function loadContactConversations(db: SupabaseClient, contactId: string, limit = 100): Promise<ConversationSummary[]> {
  const { data } = await db
    .from("inbox_emails")
    .select("id, direction, subject, received_at, provider_thread_id, status")
    .eq("contact_id", contactId)
    .order("received_at", { ascending: false })
    .limit(limit);
  return groupConversations((data ?? []) as MailRow[]);
}
