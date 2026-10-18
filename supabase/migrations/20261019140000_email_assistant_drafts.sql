-- Email assistant, step 1: reply drafts, the owner's standard answers, and our own replies inside threads.

-- Our replies live in the same thread as the customer's emails.
alter table public.inbox_emails
  add column direction text not null default 'inbound',
  add constraint inbox_emails_direction_check check (direction in ('inbound', 'outbound'));
create index inbox_emails_thread_idx on public.inbox_emails (provider_thread_id, received_at)
  where provider_thread_id is not null;

-- A reply being written for one inbound email. Nothing is sent until a human approves it.
create table public.email_drafts (
  id uuid primary key default gen_random_uuid(),
  email_id uuid not null references public.inbox_emails (id) on delete restrict,
  subject text not null,
  body_text text not null,
  -- The assistant's original wording, kept so we can learn from how the owner edits it.
  ai_body_text text,
  -- Things the owner should double-check before sending (prices, dates, unanswered questions).
  checks text[] not null default '{}',
  status text not null default 'draft',
  source text not null default 'ai',
  model text,
  approved_by uuid references public.app_users (id) on delete restrict,
  approved_at timestamptz,
  sent_at timestamptz,
  sent_message_id text,
  error_summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint email_drafts_status_check check (status in ('draft', 'approved', 'sent', 'failed', 'rejected')),
  constraint email_drafts_source_check check (source in ('ai', 'manual')),
  constraint email_drafts_subject_check check (btrim(subject) <> '' and char_length(subject) <= 300),
  constraint email_drafts_body_check check (btrim(body_text) <> '' and char_length(body_text) <= 20000),
  constraint email_drafts_approval_check check ((approved_by is null) = (approved_at is null)),
  constraint email_drafts_sent_check check ((status = 'sent') = (sent_at is not null))
);
comment on table public.email_drafts is
  'Reply drafts for inbound emails. A human approves each one before it is sent; content comes from our records, never from instructions inside the email.';
-- One live draft per email. Sent and rejected drafts are history.
create unique index email_drafts_one_open_per_email on public.email_drafts (email_id)
  where status in ('draft', 'approved', 'failed');
create index email_drafts_email_idx on public.email_drafts (email_id, created_at desc);
create index email_drafts_approved_by_idx on public.email_drafts (approved_by) where approved_by is not null;

-- The owner's signature, standard answers, writing samples and "never answer by yourself" rules.
create table public.assistant_knowledge (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  title text,
  content text not null,
  is_active boolean not null default true,
  created_by uuid references public.app_users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint assistant_knowledge_kind_check check (kind in ('faq', 'voice_sample', 'rule', 'signature')),
  constraint assistant_knowledge_content_check check (btrim(content) <> '' and char_length(content) <= 5000)
);
create unique index assistant_knowledge_one_signature on public.assistant_knowledge (kind)
  where kind = 'signature' and is_active;
create index assistant_knowledge_kind_idx on public.assistant_knowledge (kind, is_active);
create index assistant_knowledge_created_by_idx on public.assistant_knowledge (created_by) where created_by is not null;

create trigger email_drafts_set_updated_at before update on public.email_drafts
  for each row execute function private.set_updated_at();
create trigger email_drafts_no_delete before delete on public.email_drafts
  for each row execute function private.prevent_row_modification();
create trigger email_drafts_no_truncate before truncate on public.email_drafts
  for each statement execute function private.prevent_row_modification();
create trigger assistant_knowledge_set_updated_at before update on public.assistant_knowledge
  for each row execute function private.set_updated_at();
create trigger assistant_knowledge_no_delete before delete on public.assistant_knowledge
  for each row execute function private.prevent_row_modification();
create trigger assistant_knowledge_no_truncate before truncate on public.assistant_knowledge
  for each statement execute function private.prevent_row_modification();

alter table public.email_drafts enable row level security;
alter table public.assistant_knowledge enable row level security;
revoke all on public.email_drafts, public.assistant_knowledge from public, anon, authenticated, service_role;
grant select on public.email_drafts, public.assistant_knowledge to authenticated;
grant select, insert, update on public.email_drafts, public.assistant_knowledge to service_role;

create policy email_drafts_select_admin on public.email_drafts
  for select to authenticated using ((select private.is_active_admin()));
create policy assistant_knowledge_select_admin on public.assistant_knowledge
  for select to authenticated using ((select private.is_active_admin()));
