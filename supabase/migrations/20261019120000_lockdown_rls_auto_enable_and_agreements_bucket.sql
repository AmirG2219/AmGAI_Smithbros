-- Platform function created by Supabase's "auto-enable RLS" option. It is an event-trigger
-- function and must not be callable through the API (flagged by the security advisor).
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;

-- Private bucket for agreement templates and generated/signed PDFs.
-- No storage.objects policies on purpose: only the server (service_role) can read or write.
insert into storage.buckets (id, name, public, file_size_limit)
values ('agreements', 'agreements', false, 20971520)
on conflict (id) do nothing;
