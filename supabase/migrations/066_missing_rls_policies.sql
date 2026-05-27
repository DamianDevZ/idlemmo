-- Migration 066: Add missing RLS policies for 4 tables that were silently blocking all game queries.
-- tier_scaling_config and special_attack_scrolls are read-only reference data (no character_id).
-- character_item_mastery and character_special_attacks are per-character, own rows only.

-- ─── tier_scaling_config ──────────────────────────────────────────────────────
create policy "tier_scaling_config: authenticated read"
  on public.tier_scaling_config for select to authenticated
  using (true);

-- ─── character_item_mastery ───────────────────────────────────────────────────
create policy "item_mastery: own only"
  on public.character_item_mastery for all to authenticated
  using (character_id = public.my_character_id())
  with check (character_id = public.my_character_id());

-- ─── character_special_attacks ────────────────────────────────────────────────
create policy "special_attacks: own only"
  on public.character_special_attacks for all to authenticated
  using (character_id = public.my_character_id())
  with check (character_id = public.my_character_id());

-- ─── special_attack_scrolls ───────────────────────────────────────────────────
create policy "special_attack_scrolls: authenticated read"
  on public.special_attack_scrolls for select to authenticated
  using (true);
