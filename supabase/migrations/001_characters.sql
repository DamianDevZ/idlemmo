-- Migration 001: Characters & Attributes
-- Depends on: Supabase auth.users

-- Enable UUID generation
create extension if not exists "pgcrypto";

-- ─── Characters ───────────────────────────────────────────────────────────────
create table public.characters (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users(id) on delete cascade,
  name                  text not null check (char_length(name) between 2 and 24),
  main_level            int  not null default 1 check (main_level >= 1),
  main_xp               int  not null default 0 check (main_xp >= 0),
  skill_points_available int not null default 0 check (skill_points_available >= 0),
  current_hp            int  not null default 50,  -- updated by game logic
  current_stamina       int  not null default 50,  -- updated by game logic
  stash_slots           int  not null default 100, -- matches GAME_CONFIG.homeBase.defaultStashSlots
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- One character per user (expand to multiple later if desired)
create unique index characters_user_id_idx on public.characters(user_id);

-- ─── Character Attributes ─────────────────────────────────────────────────────
-- Default value 5 matches GAME_CONFIG.character.startingAttributeValue
create table public.character_attributes (
  character_id  uuid primary key references public.characters(id) on delete cascade,
  vigor         int not null default 5 check (vigor         between 1 and 99),
  endurance     int not null default 5 check (endurance     between 1 and 99),
  strength      int not null default 5 check (strength      between 1 and 99),
  dexterity     int not null default 5 check (dexterity     between 1 and 99),
  intelligence  int not null default 5 check (intelligence  between 1 and 99),
  faith         int not null default 5 check (faith         between 1 and 99),
  arcane        int not null default 5 check (arcane        between 1 and 99)
);

-- ─── Auto-update updated_at ───────────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger characters_updated_at
  before update on public.characters
  for each row execute function public.set_updated_at();
