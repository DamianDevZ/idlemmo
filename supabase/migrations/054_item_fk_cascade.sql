-- Migration 054: Add ON DELETE CASCADE to item_definitions FK references
-- Without this, deleting an item definition fails if any character holds it
-- in their inventory/stash, or if a recipe references it as output.

-- character_inventory
alter table public.character_inventory
  drop constraint character_inventory_item_id_fkey;
alter table public.character_inventory
  add constraint character_inventory_item_id_fkey
  foreign key (item_id) references public.item_definitions(id) on delete cascade;

-- character_stash
alter table public.character_stash
  drop constraint character_stash_item_id_fkey;
alter table public.character_stash
  add constraint character_stash_item_id_fkey
  foreign key (item_id) references public.item_definitions(id) on delete cascade;

-- recipes (output_item_id)
alter table public.recipes
  drop constraint recipes_output_item_id_fkey;
alter table public.recipes
  add constraint recipes_output_item_id_fkey
  foreign key (output_item_id) references public.item_definitions(id) on delete cascade;
