// Shapes shared by the inbox page (server) and the inbox view (browser).

export type DraftT = {
  id: string;
  status: string;
  subject: string;
  body_text: string;
  checks: string[];
  source: string;
  error_summary: string | null;
  sent_at: string | null;
};

export type MsgT = {
  id: string;
  direction: "inbound" | "outbound";
  from_address: string;
  from_name: string | null;
  body_text: string;
  received_at: string;
};

export type AttachT = { id: string; filename: string; content_type: string; size_bytes: number; stored?: boolean };

export type EmailT = {
  id: string;
  direction: "inbound" | "outbound";
  status: string;
  from_address: string;
  from_name: string | null;
  to_addresses?: string[] | null;
  subject: string;
  body_text: string;
  received_at: string;
  read_at: string | null;
  body_html?: string | null;
  provider_thread_id: string | null;
  analysis_status: string;
  category: string | null;
  priority: string | null;
  needs_reply: boolean | null;
  summary: string | null;
  suggested_action: string | null;
  contact_id: string | null;
  project_id: string | null;
  contacts: { id: string; first_name: string; last_name: string | null } | null;
  email_drafts: DraftT[];
  inbox_attachments: AttachT[];
};

export type WaitingT = { emailId: string; name: string; subject: string; daysWaiting: number };

// What the "open this email" call returns when the email is not already on the page.
export type PanelData = { email: Omit<EmailT, "email_drafts">; thread: MsgT[]; drafts: DraftT[] };

export type ActionResult = { ok: boolean; notice?: string; draft?: DraftT | null };

export const OPEN_DRAFT = ["draft", "approved", "failed"];

export type LinkInfo = {
  contact: { id: string; first_name: string; last_name: string | null; email: string | null; phone: string | null } | null;
  project: { id: string; project_type: string | null; site_address_line1: string | null; site_city: string | null; stage: string | null } | null;
};
