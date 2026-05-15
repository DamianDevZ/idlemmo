-- Migration 006: Social — Friends & Friend Requests
-- Depends on: 001_characters

-- ─── Friend Requests ──────────────────────────────────────────────────────────
create table public.friend_requests (
  id                  uuid primary key default gen_random_uuid(),
  from_character_id   uuid not null references public.characters(id) on delete cascade,
  to_character_id     uuid not null references public.characters(id) on delete cascade,
  status              text not null default 'pending'
    check (status in ('pending','accepted','declined','blocked')),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  check (from_character_id <> to_character_id),
  unique (from_character_id, to_character_id)
);

create trigger friend_requests_updated_at
  before update on public.friend_requests
  for each row execute function public.set_updated_at();

-- ─── Friends (bidirectional; one row per direction for easy RLS) ─────────────
create table public.friends (
  character_id        uuid not null references public.characters(id) on delete cascade,
  friend_character_id uuid not null references public.characters(id) on delete cascade,
  created_at          timestamptz not null default now(),
  primary key (character_id, friend_character_id),
  check (character_id <> friend_character_id)
);

-- ─── Function: Accept friend request → insert both rows ──────────────────────
create or replace function public.accept_friend_request(p_request_id uuid, p_to_character_id uuid)
returns void
language plpgsql security invoker as $$
declare
  v_from uuid;
begin
  -- Verify the request belongs to this character and is pending
  select from_character_id into v_from
  from public.friend_requests
  where id = p_request_id
    and to_character_id = p_to_character_id
    and status = 'pending';

  if v_from is null then
    raise exception 'Friend request not found or already actioned';
  end if;

  -- Mark accepted
  update public.friend_requests set status = 'accepted' where id = p_request_id;

  -- Insert both directions so either character can query their own friends
  insert into public.friends (character_id, friend_character_id)
  values (v_from, p_to_character_id), (p_to_character_id, v_from)
  on conflict do nothing;
end;
$$;
