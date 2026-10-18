-- Private staff notes on a client (e.g. "dog in the house, call before 5pm").
alter table public.contacts add column if not exists notes text check (notes is null or char_length(notes) <= 4000);
