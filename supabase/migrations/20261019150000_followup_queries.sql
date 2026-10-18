-- Follow-up lookups done inside the database in one call (instead of two round trips from the app).
-- SECURITY INVOKER: the caller's row-level security still applies, so only active admins see anything.

-- Customers we replied to who have not written back for p_days days.
create or replace function public.waiting_on_customers(p_days integer default 3)
returns table (email_id uuid, name text, subject text, sent_at timestamptz, days_waiting integer)
language sql stable security invoker set search_path = ''
as $$
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
  order by l.received_at asc;
$$;

-- Leads who were emailed an estimate p_days or more ago and still have no consultation.
create or replace function public.unbooked_leads(p_days integer default 3)
returns table (id uuid, name text, sent_at timestamptz, days_since integer, price_min numeric, price_max numeric, is_placeholder boolean)
language sql stable security invoker set search_path = ''
as $$
  select p.id,
         btrim(concat_ws(' ', c.first_name, c.last_name)),
         e.sent_at,
         floor(extract(epoch from (now() - e.sent_at)) / 86400)::integer,
         e.price_min,
         e.price_max,
         coalesce((e.pricing_snapshot ->> 'is_placeholder')::boolean, false)
  from public.projects p
  join public.contacts c on c.id = p.contact_id
  cross join lateral (
    select x.sent_at, x.price_min, x.price_max, x.pricing_snapshot
    from public.estimates x
    where x.project_id = p.id and x.status = 'sent' and x.sent_at is not null
    order by x.revision_number desc
    limit 1
  ) e
  where p.stage = 'estimate_sent'
    and e.sent_at <= now() - make_interval(days => greatest(p_days, 0))
  order by e.sent_at asc
  limit 200;
$$;

revoke all on function public.waiting_on_customers(integer), public.unbooked_leads(integer) from public, anon;
grant execute on function public.waiting_on_customers(integer), public.unbooked_leads(integer) to authenticated, service_role;
