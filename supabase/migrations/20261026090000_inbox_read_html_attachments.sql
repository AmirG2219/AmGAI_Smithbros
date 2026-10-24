-- Inbox: unread marking, formatted (HTML) emails, and attachments.

-- read_at is empty until someone opens the email. Mail we sent ourselves counts as read.
alter table public.inbox_emails
  add column if not exists read_at timestamptz,
  add column if not exists body_html text;

update public.inbox_emails set read_at = received_at where direction = 'outbound' and read_at is null;

-- Attachments: details of each file, plus where the file itself is kept (empty when only its details arrived).
create table public.inbox_attachments (
  id uuid primary key default gen_random_uuid(),
  email_id uuid not null references public.inbox_emails (id),
  filename text not null check (char_length(filename) between 1 and 255),
  content_type text not null default 'application/octet-stream',
  size_bytes integer not null check (size_bytes >= 0),
  storage_path text unique,
  created_at timestamptz not null default now()
);
create index inbox_attachments_email_idx on public.inbox_attachments (email_id);

create trigger inbox_attachments_no_change before update or delete on public.inbox_attachments
  for each row execute function private.prevent_row_modification();
create trigger inbox_attachments_no_truncate before truncate on public.inbox_attachments
  for each statement execute function private.prevent_row_modification();

alter table public.inbox_attachments enable row level security;
revoke all on public.inbox_attachments from public, anon, authenticated, service_role;
grant select on public.inbox_attachments to authenticated;
grant select, insert on public.inbox_attachments to service_role;
create policy inbox_attachments_select_admin on public.inbox_attachments
  for select to authenticated
  using ((select private.is_active_admin()));

-- read_at can be set by the server when an email is opened.
-- (service_role already has update on inbox_emails.)

-- Private bucket for the files. No storage policies on purpose: only the server reads or writes it.
insert into storage.buckets (id, name, public, file_size_limit)
values ('inbox-attachments', 'inbox-attachments', false, 10485760)
on conflict (id) do nothing;

-- The side panel now also gets the attachments.
create or replace function public.email_panel(p_id uuid)
 returns jsonb
 language sql
 stable
 security invoker
 set search_path to ''
as $function$
  select jsonb_build_object(
    'email', to_jsonb(e) || jsonb_build_object(
      'contacts', (select to_jsonb(c) from (select id, first_name, last_name from public.contacts where id = e.contact_id) c),
      'inbox_attachments', coalesce((
        select jsonb_agg(to_jsonb(a) order by a.created_at)
        from (select id, filename, content_type, size_bytes, created_at, (storage_path is not null) as stored from public.inbox_attachments where email_id = e.id) a
      ), '[]'::jsonb)
    ),
    'thread', coalesce((
      select jsonb_agg(to_jsonb(t) order by t.received_at)
      from (
        select id, direction, from_address, from_name, body_text, received_at
        from public.inbox_emails
        where e.provider_thread_id is not null and provider_thread_id = e.provider_thread_id
        order by received_at
        limit 30
      ) t
    ), '[]'::jsonb),
    'drafts', coalesce((
      select jsonb_agg(to_jsonb(d))
      from (
        select id, status, subject, body_text, checks, source, error_summary, sent_at
        from public.email_drafts
        where email_id = e.id
        order by created_at desc
        limit 5
      ) d
    ), '[]'::jsonb)
  )
  from public.inbox_emails e
  where e.id = p_id;
$function$;

-- Unread count and newest arrival, for the inbox's "new mail" check (one cheap call).
create index if not exists inbox_emails_unread_idx
  on public.inbox_emails (received_at desc)
  where direction = 'inbound' and read_at is null;
