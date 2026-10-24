-- Indexes for the lists and counts the dashboard runs on every page, so they stay fast as the data grows.
-- (Names/email/phone search uses ILIKE; at the sizes this business will reach a scan is milliseconds, so no trigram indexes yet.)

-- Clients list: newest first, optionally one source.
create index if not exists contacts_created_at_idx on public.contacts (created_at desc);
create index if not exists contacts_source_created_at_idx on public.contacts (source, created_at desc);

-- Leads: newest first, and the "hot" count on the Overview.
create index if not exists projects_created_at_idx on public.projects (created_at desc);
create index if not exists projects_classification_created_at_idx on public.projects (lead_classification, created_at desc);

-- Email assistant: the "Needs reply" tab and badge (open inbound mail, reply wanted or not yet known).
create index if not exists inbox_emails_needs_reply_idx
  on public.inbox_emails (received_at desc)
  where direction = 'inbound' and status = 'open' and needs_reply is not false;

-- Email assistant: "Waiting on customer" looks at our latest outbound mail, then each customer's inbound mail.
create index if not exists inbox_emails_outbound_recent_idx
  on public.inbox_emails (received_at desc)
  where direction = 'outbound';
create index if not exists inbox_emails_inbound_sender_idx
  on public.inbox_emails (from_address, received_at desc)
  where direction = 'inbound';

-- Documents lists: one type, newest first.
create index if not exists agreements_type_created_at_idx on public.agreements (document_type, created_at desc);

-- Consultations: scheduled ones, by date (Overview count and today's list).
create index if not exists appointments_status_start_at_idx on public.appointments (status, start_at);

-- "Waiting on customer" can never return an unbounded list.
create or replace function public.waiting_on_customers(p_days integer default 3)
 returns table(email_id uuid, name text, subject text, sent_at timestamp with time zone, days_waiting integer)
 language sql
 stable
 set search_path to ''
as $function$
  with last_out as (
    select distinct on (o.to_addresses[1]) o.to_addresses[1] as customer, o.received_at
    from public.inbox_emails o
    where o.direction = 'outbound'
      and o.to_addresses[1] is not null
      and o.received_at > now() - interval '60 days'
    order by o.to_addresses[1], o.received_at desc
  )
  select t.id,
         coalesce(t.from_name, t.from_address),
         t.subject,
         l.received_at,
         floor(extract(epoch from (now() - l.received_at)) / 86400)::integer
  from last_out l
  cross join lateral (
    select i.id, i.from_name, i.from_address, i.subject
    from public.inbox_emails i
    where i.direction = 'inbound' and i.from_address = l.customer and i.received_at < l.received_at
    order by i.received_at desc
    limit 1
  ) t
  where l.received_at <= now() - make_interval(days => greatest(p_days, 0))
    and not exists (
      select 1 from public.inbox_emails r
      where r.direction = 'inbound' and r.from_address = l.customer and r.received_at > l.received_at
    )
  order by l.received_at asc
  limit 200;
$function$;
