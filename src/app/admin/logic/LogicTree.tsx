'use client';

import Link from 'next/link';
import { useState } from 'react';

// ── Shared types ─────────────────────────────────────────────────────────────

export type IngredientEntry = { display_name: string; quantity: number };

export type LootEntry    = { item_id: string; display_name: string; item_tier: number | null; weight: number };
export type EnemyEntry   = { enemy_id: string; display_name: string; icon: string; weight: number };
export type AreaTier     = { tier: number; loot: LootEntry[]; enemies: EnemyEntry[] };
export type AreaLogic    = { id: string; display_name: string; icon: string; tiers: AreaTier[] };

export type RecipeTier   = { tier: number; output_quantity: number; ingredients: IngredientEntry[] };
export type CraftItem    = { id: string; display_name: string; has_recipe: boolean; tiers: RecipeTier[] };
export type CraftGroup   = { type: string; label: string; items: CraftItem[] };

export type RefineRecipe = { id: string; output_item_id: string; display_name: string; tier: number; output_quantity: number; ingredients: IngredientEntry[] };
export type RefineGroup  = { skill_id: string; skill_display: string; recipes: RefineRecipe[] };

export type MasteryItem  = { id: string; display_name: string };
export type MasteryCat   = { name: string; display: string; icon: string; earnedBy: string; gates: string; items: MasteryItem[] };

interface Props {
  areaLogic:   AreaLogic[];
  craftGroups: CraftGroup[];
  refineGroups: RefineGroup[];
  masteryData: MasteryCat[];
}

// ── Tree node ─────────────────────────────────────────────────────────────────

function Node({
  label,
  badge,
  hint,
  href,
  dim,
  defaultOpen = false,
  children,
}: {
  label: React.ReactNode;
  badge?: string;
  hint?: string;
  href?: string;
  dim?: boolean;
  defaultOpen?: boolean;
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const hasChildren = Boolean(children);

  return (
    <div>
      <div
        role={hasChildren ? 'button' : undefined}
        onClick={() => hasChildren && setOpen(o => !o)}
        className={`flex items-center gap-1.5 py-[3px] rounded transition-colors ${hasChildren ? 'cursor-pointer hover:bg-accent/30' : ''} ${dim ? 'opacity-40' : ''}`}
      >
        {/* Chevron */}
        <span className={`w-4 shrink-0 text-[10px] text-muted-foreground text-center select-none transition-transform ${open ? 'rotate-90' : ''}`}>
          {hasChildren ? '▶' : ''}
        </span>

        {/* Label */}
        {href ? (
          <Link
            href={href}
            onClick={e => e.stopPropagation()}
            className="text-sm text-primary hover:underline leading-snug"
          >
            {label}
          </Link>
        ) : (
          <span className={`text-sm leading-snug ${hasChildren ? 'font-medium text-foreground' : 'text-muted-foreground'}`}>
            {label}
          </span>
        )}

        {/* Badge */}
        {badge && (
          <span className="ml-1 text-[10px] font-medium text-muted-foreground bg-accent/40 px-1.5 py-0.5 rounded-full shrink-0">
            {badge}
          </span>
        )}

        {/* Hint (lock/gate info) */}
        {hint && (
          <span className="ml-auto text-[10px] text-muted-foreground italic shrink-0 pr-1">
            {hint}
          </span>
        )}
      </div>

      {/* Children indented with connector line */}
      {open && hasChildren && (
        <div className="ml-5 pl-3 border-l border-border/40">
          {children}
        </div>
      )}
    </div>
  );
}

// ── Pill row (ingredients / weights) ─────────────────────────────────────────

function Pills({ items }: { items: { label: string; variant?: 'default' | 'output' }[] }) {
  return (
    <div className="flex flex-wrap gap-1.5 pl-5 py-1">
      {items.map((p, i) => (
        <span
          key={i}
          className={`text-[11px] px-2 py-0.5 rounded-full ${
            p.variant === 'output'
              ? 'bg-primary/15 text-primary border border-primary/30'
              : 'bg-accent/30 text-muted-foreground border border-border/50'
          }`}
        >
          {p.label}
        </span>
      ))}
    </div>
  );
}

function Empty({ msg }: { msg: string }) {
  return <p className="text-sm text-muted-foreground py-10 text-center">{msg}</p>;
}

// ── Tab: Exploration ──────────────────────────────────────────────────────────

function ExplorationTab({ areas }: { areas: AreaLogic[] }) {
  if (areas.length === 0) return <Empty msg="No areas configured yet." />;

  return (
    <div className="space-y-0.5">
      {areas.map(area => (
        <Node
          key={area.id}
          label={`${area.icon} ${area.display_name}`}
          badge={area.tiers.length > 0 ? `${area.tiers.length} tiers` : 'no tiers'}
          href={`/admin/world/${area.id}`}
          defaultOpen={false}
        >
          {area.tiers.map(t => (
            <Node
              key={t.tier}
              label={`Tier ${t.tier}`}
              badge={`${t.enemies.length} enemies · ${t.loot.length} loot`}
            >
              {t.enemies.length > 0 && (
                <Node label="👹 Enemy Spawns" defaultOpen>
                  {t.enemies.map(e => (
                    <Node
                      key={e.enemy_id}
                      label={`${e.icon} ${e.display_name}`}
                      badge={`weight ${e.weight}`}
                      href={`/admin/enemies/${e.enemy_id}`}
                    />
                  ))}
                </Node>
              )}
              {t.loot.length > 0 && (
                <Node label="📦 Loot Table" defaultOpen>
                  {t.loot.map((l, i) => (
                    <Node
                      key={`${l.item_id}-${i}`}
                      label={l.display_name + (l.item_tier ? ` (T${l.item_tier})` : '')}
                      badge={`weight ${l.weight}`}
                      href={`/admin/items/${l.item_id}`}
                    />
                  ))}
                </Node>
              )}
            </Node>
          ))}
        </Node>
      ))}
    </div>
  );
}

// ── Tab: Crafting ─────────────────────────────────────────────────────────────

function CraftingTab({ groups }: { groups: CraftGroup[] }) {
  const total = groups.reduce((n, g) => n + g.items.filter(i => i.has_recipe).length, 0);
  if (total === 0) return <Empty msg="No crafting recipes configured yet." />;

  return (
    <div className="space-y-0.5">
      {groups.map(group => {
        const craftable = group.items.filter(i => i.has_recipe).length;
        return (
          <Node
            key={group.type}
            label={group.label}
            badge={`${craftable} / ${group.items.length} craftable`}
            defaultOpen
          >
            {group.items.map(item => (
              <Node
                key={item.id}
                label={item.display_name}
                href={`/admin/items/${item.id}`}
                badge={item.has_recipe ? undefined : 'no recipe'}
                dim={!item.has_recipe}
              >
                {item.tiers.length > 0 && item.tiers.map(t => (
                  <Node
                    key={t.tier}
                    label={`Tier ${t.tier}`}
                    hint={t.tier === 1 ? 'free' : `🔒 mastery T${t.tier - 1}`}
                  >
                    <Pills
                      items={[
                        ...t.ingredients.map(ing => ({ label: `${ing.display_name} ×${ing.quantity}` })),
                        { label: `→ ×${t.output_quantity}`, variant: 'output' as const },
                      ]}
                    />
                  </Node>
                ))}
              </Node>
            ))}
          </Node>
        );
      })}
    </div>
  );
}

// ── Tab: Refining ─────────────────────────────────────────────────────────────

function RefiningTab({ groups }: { groups: RefineGroup[] }) {
  if (groups.length === 0) return <Empty msg="No refining recipes configured yet." />;

  return (
    <div className="space-y-0.5">
      {groups.map(group => (
        <Node
          key={group.skill_id}
          label={group.skill_display}
          badge={`${group.recipes.length} recipes`}
          defaultOpen
        >
          {group.recipes.map(recipe => (
            <Node
              key={recipe.id}
              label={recipe.display_name}
              href={`/admin/items/${recipe.output_item_id}`}
              hint={recipe.tier === 1 ? 'free' : `🔒 refining T${recipe.tier - 1}`}
            >
              <Pills
                items={[
                  ...recipe.ingredients.map(ing => ({ label: `${ing.display_name} ×${ing.quantity}` })),
                  { label: `→ ×${recipe.output_quantity}`, variant: 'output' as const },
                ]}
              />
            </Node>
          ))}
        </Node>
      ))}
    </div>
  );
}

// ── Tab: Mastery ──────────────────────────────────────────────────────────────

function MasteryTab({ cats }: { cats: MasteryCat[] }) {
  return (
    <div className="space-y-3">
      {/* Gate rule callout */}
      <div className="bg-primary/5 border border-primary/20 rounded-lg px-4 py-3 space-y-1">
        <p className="text-sm font-semibold text-primary">How the gate works</p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Tier 1 is always free. For T2+, the character needs mastery tier N−1 for that <em>specific item</em>.
          Example: crafting a T3 Iron Sword requires <strong>weapon_crafting T2</strong> allocated to Iron Sword.
          Mastery is earned by doing the action (combat → mastery, crafting → crafting, refining → refining)
          and then spent per-item via the Skills → Mastery page.
        </p>
      </div>

      <div className="space-y-0.5">
        {cats.map(cat => (
          <Node
            key={cat.name}
            label={`${cat.icon} ${cat.display}`}
            badge={`${cat.items.length} items`}
            defaultOpen={false}
          >
            {/* Category metadata */}
            <div className="ml-5 py-2 space-y-0.5">
              <p className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">XP earned by:</span> {cat.earnedBy}
              </p>
              <p className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Gates:</span> {cat.gates}
              </p>
            </div>

            {/* Item list */}
            {cat.items.length > 0 ? cat.items.map(item => (
              <Node
                key={item.id}
                label={item.display_name}
                href={`/admin/items/${item.id}`}
              />
            )) : (
              <p className="text-xs text-muted-foreground ml-5 pb-2">No items of this type yet.</p>
            )}
          </Node>
        ))}
      </div>
    </div>
  );
}

// ── Root export ───────────────────────────────────────────────────────────────

const TABS = [
  { id: 'exploration', label: '🗺️ Exploration' },
  { id: 'crafting',    label: '🔨 Crafting'   },
  { id: 'refining',    label: '🔥 Refining'   },
  { id: 'mastery',     label: '⭐ Mastery'    },
] as const;

type TabId = typeof TABS[number]['id'];

export function LogicTree({ areaLogic, craftGroups, refineGroups, masteryData }: Props) {
  const [tab, setTab] = useState<TabId>('exploration');

  return (
    <div>
      {/* Tab bar */}
      <div className="flex gap-0 border-b border-border mb-5">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2.5 text-sm transition-colors whitespace-nowrap ${
              tab === t.id
                ? 'font-semibold text-primary border-b-2 border-primary -mb-px'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tree content */}
      <div className="text-sm">
        {tab === 'exploration' && <ExplorationTab areas={areaLogic} />}
        {tab === 'crafting'    && <CraftingTab    groups={craftGroups} />}
        {tab === 'refining'    && <RefiningTab    groups={refineGroups} />}
        {tab === 'mastery'     && <MasteryTab     cats={masteryData} />}
      </div>
    </div>
  );
}
