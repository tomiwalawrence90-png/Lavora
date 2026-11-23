-- LAVORA 7.0 — Live streaming (Agora). Run once in Supabase -> SQL editor. Safe to re-run.
-- Clients can READ streams. Only the Edge Function (service role) can write them.

create table if not exists public.live_config (
  id int primary key default 1 check (id = 1),
  streaming_enabled boolean not null default false,   -- master kill switch. OFF until you flip it.
  updated_at timestamptz not null default now()
);
insert into public.live_config (id) values (1) on conflict (id) do nothing;
alter table public.live_config enable row level security;   -- no policies = clients can't see or change it

create table if not exists public.streams (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 80),
  game_name text check (game_name is null or char_length(game_name) <= 60),
  stream_type text not null default 'camera' check (stream_type in ('camera','gameplay')),
  channel_name text not null unique,
  status text not null default 'created'
    check (status in ('created','starting','live','reconnecting','ended','failed')),
  started_at timestamptz,
  ended_at timestamptz,
  last_heartbeat timestamptz,
  viewer_count int not null default 0 check (viewer_count >= 0),   -- approximate
  audience_joins int not null default 0,                           -- audience tokens issued (usage estimate)
  est_minutes numeric not null default 0,                          -- estimated Agora minutes consumed
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists streams_status_hb_idx on public.streams (status, last_heartbeat desc);
create index if not exists streams_user_idx on public.streams (user_id, created_at desc);
create index if not exists streams_created_idx on public.streams (created_at);

create or replace function public.touch_streams() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists streams_touch on public.streams;
create trigger streams_touch before update on public.streams for each row execute function public.touch_streams();

alter table public.streams enable row level security;
drop policy if exists "streams readable by members" on public.streams;
create policy "streams readable by members" on public.streams for select to authenticated using (true);
-- Deliberately NO insert/update/delete policies: only the Edge Function may change streams.

create or replace function public.bump_viewers(p_stream uuid, p_delta int, p_joined int)
returns void language sql security definer set search_path = public as $$
  update public.streams
     set viewer_count = greatest(0, viewer_count + p_delta),
         audience_joins = audience_joins + p_joined
   where id = p_stream;
$$;
revoke all on function public.bump_viewers(uuid, int, int) from public, anon, authenticated;
grant execute on function public.bump_viewers(uuid, int, int) to service_role;

do $$ begin
  alter publication supabase_realtime add table public.streams;
exception when duplicate_object then null; when undefined_object then null; end $$;

-- AFTER you have verified your Agora free allowance in the Agora console and deployed the function:
--   update public.live_config set streaming_enabled = true where id = 1;
-- To stop all new broadcasts instantly:
--   update public.live_config set streaming_enabled = false where id = 1;
