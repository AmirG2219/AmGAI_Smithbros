-- One call returns everything the inbox side panel shows for an email: the email (with its client), its conversation, and its drafts.
-- Runs as the signed-in user, so row security still applies.
create or replace function public.email_panel(p_id uuid)
 returns jsonb
 language sql
 stable
 security invoker
 set search_path to ''
as $function$
  select jsonb_build_object(
    'email', to_jsonb(e) || jsonb_build_object(
      'contacts', (select to_jsonb(c) from (select id, first_name, last_name from public.contacts where id = e.contact_id) c)
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
