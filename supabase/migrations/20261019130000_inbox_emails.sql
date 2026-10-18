-- Email assistant, phase A: inbound emails from the business inbox, with AI triage results.
-- Same conventions as the rest of the schema: RLS on, admin-read-only for the browser, writes only via
-- the server (service_role), no deletes.

create table public.inbox_emails (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'gmail',
  provider_message_id text not null,
  provider_thread_id text,
  from_address text not null,
  from_name text,
  to_addresses text[] not null default '{}',
  subject text not null default '',
  received_at timestamptz not null,
  body_text text not null default '',
  contact_id uuid references public.contacts (id) on delete restrict,
  project_id uuid,
  -- AI triage (advisory; staff decide)
  analysis_status text not null default 'pending',
  category text,
  priority text,
  needs_reply boolean,
  summary text,
  suggested_action text,
  analysis_model text,
  analyzed_at timestamptz,
  -- Staff workflow
  status text not null default 'open',
  handled_by uuid references public.app_users (id) on delete restrict,
  handled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inbox_emails_message_key unique (provider, provider_message_id),
  constraint inbox_emails_project_contact_fkey foreign key (project_id, contact_id)
    references public.projects (id, contact_id) on delete restrict,
  constraint inbox_emails_project_needs_contact_check check (project_id is null or contact_id is not null),
  constraint inbox_emails_from_normalized_check check (from_address = lower(btrim(from_address)) and from_address <> ''),
  constraint inbox_emails_body_size_check check (char_length(body_text) <= 50000),
  constraint inbox_emails_analysis_status_check check (analysis_status in ('pending', 'done', 'failed', 'skipped')),
  constraint inbox_emails_category_check check (category is null or category in
    ('lead_reply', 'customer_question', 'scheduling', 'quote_or_contract', 'invoice_or_payment', 'supplier', 'spam_or_marketing', 'other')),
  constraint inbox_emails_priority_check check (priority is null or priority in ('urgent', 'high', 'normal', 'low')),
  constraint inbox_emails_status_check check (status in ('open', 'handled', 'archived')),
  constraint inbox_emails_handled_check check ((status = 'open') = (handled_at is null))
);

comment on table public.inbox_emails is
  'Inbound emails from the dedicated business inbox, with advisory AI triage. Email content is untrusted input and is never treated as instructions.';

create index inbox_emails_received_idx on public.inbox_emails (received_at desc);
create index inbox_emails_status_idx on public.inbox_emails (status, received_at desc);
create index inbox_emails_contact_idx on public.inbox_emails (contact_id, received_at desc) where contact_id is not null;
create index inbox_emails_project_contact_idx on public.inbox_emails (project_id, contact_id) where project_id is not null;
create index inbox_emails_handled_by_idx on public.inbox_emails (handled_by) where handled_by is not null;

create trigger inbox_emails_set_updated_at before update on public.inbox_emails
  for each row execute function private.set_updated_at();
create trigger inbox_emails_no_delete before delete on public.inbox_emails
  for each row execute function private.prevent_row_modification();
create trigger inbox_emails_no_truncate before truncate on public.inbox_emails
  for each statement execute function private.prevent_row_modification();

alter table public.inbox_emails enable row level security;
revoke all on public.inbox_emails from public, anon, authenticated, service_role;
grant select on public.inbox_emails to authenticated;
grant select, insert, update on public.inbox_emails to service_role;

create policy inbox_emails_select_admin on public.inbox_emails
  for select to authenticated
  using ((select private.is_active_admin()));
