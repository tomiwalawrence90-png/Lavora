-- LAVORA 7.1 — live chat (text, stickers, gifts). Run once in Supabase -> SQL editor. Safe to re-run.
-- Hearts are ephemeral (Realtime broadcast) and need no table. Gifts are design-only: no balances touched.

create table if not exists public.stream_chat (
  id uuid primary key default gen_random_uuid(),
  stream_id uuid not null references public.streams(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('text','sticker','gift')),
  content text not null check (char_length(content) between 1 and 200),
  created_at timestamptz not null default now()
);
create index if not exists stream_chat_stream_idx on public.stream_chat (stream_id, created_at desc);

alter table public.stream_chat enable row level security;
drop policy if exists "stream chat readable by members" on public.stream_chat;
create policy "stream chat readable by members" on public.stream_chat for select to authenticated using (true);
drop policy if exists "members post to live streams as themselves" on public.stream_chat;
create policy "members post to live streams as themselves" on public.stream_chat for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.streams s where s.id = stream_id and s.status in ('starting','live','reconnecting'))
  );
-- no update/delete policies: messages are immutable for clients

-- simple server-side rate limit: one message per 700 ms per user
create or replace function public.stream_chat_rate_limit() returns trigger language plpgsql as $$
begin
  if exists (select 1 from public.stream_chat where user_id = new.user_id and created_at > now() - interval '700 milliseconds') then
    raise exception 'slow down';
  end if;
  return new;
end $$;
drop trigger if exists stream_chat_rl on public.stream_chat;
create trigger stream_chat_rl before insert on public.stream_chat for each row execute function public.stream_chat_rate_limit();

do $$ begin
  alter publication supabase_realtime add table public.stream_chat;
exception when duplicate_object then null; when undefined_object then null; end $$;
