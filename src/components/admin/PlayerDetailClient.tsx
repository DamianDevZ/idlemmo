'use client';

import { useState, useTransition } from 'react';
import { adminGiveItem, adminRemoveItem, adminUpdateCharacter, adminSetAttribute } from '@/features/admin/player-actions';

const ATTRS = ['vigor','endurance','strength','dexterity','intelligence','faith','arcane'] as const;
const RATINGS = ['S','A','B','C','D','F'];

type InventoryRow = {
  instance_id: string;
  item_id: string;
  quantity: number;
  equipped_slot: string | null;
  item_rating: string | null;
  tier: number;
  item_definitions: { display_name: string; type: string; rarity: string; equipment_tier: number | null } | null;
};

type StashRow = {
  instance_id: string;
  item_id: string;
  quantity: number;
  item_rating: string | null;
  item_definitions: { display_name: string; type: string; rarity: string } | null;
};

type SkillRow = {
  skill_id: string;
  level: number;
  xp_toward_next_level: number;
  skills: { display_name: string } | null;
};

type Character = {
  id: string; name: string; main_level: number; main_xp: number;
  current_hp: number; current_stamina: number; skill_points_available: number; stash_slots: number;
};

type Attrs = Record<string, number> | null;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      <div className="px-4 py-2 border-b border-border bg-accent/20">
        <h2 className="text-sm font-semibold text-heading">{title}</h2>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

export function PlayerDetailClient({
  characterId, character, attrs, inventory, stash, skills, allItems, maxTier = 10,
}: {
  characterId: string;
  character: Character;
  attrs: Attrs;
  inventory: InventoryRow[];
  stash: StashRow[];
  skills: SkillRow[];
  allItems: { id: string; display_name: string; type: string }[];
  maxTier?: number;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Character field editing
  const [charFields, setCharFields] = useState({
    main_level: character.main_level,
    main_xp: character.main_xp,
    current_hp: character.current_hp,
    current_stamina: character.current_stamina,
    skill_points_available: character.skill_points_available,
  });

  // Attribute editing
  const [attrValues, setAttrValues] = useState<Record<string, number>>(
    Object.fromEntries(ATTRS.map(a => [a, (attrs as Record<string, number>)?.[a] ?? 5]))
  );

  // Give item
  const [giveItemId, setGiveItemId] = useState('');
  const [giveQty, setGiveQty] = useState(1);
  const [giveRating, setGiveRating] = useState('');
  const [giveTier, setGiveTier] = useState(1);

  function notify(msg: string) {
    setSuccess(msg);
    setTimeout(() => setSuccess(null), 3000);
  }

  function handleSaveChar() {
    startTransition(async () => {
      try {
        await adminUpdateCharacter(characterId, charFields);
        notify('Character stats updated');
      } catch (e) { setError((e as Error).message); }
    });
  }

  function handleSaveAttr(attr: string) {
    startTransition(async () => {
      try {
        await adminSetAttribute(characterId, attr, attrValues[attr]);
        notify(`${attr} updated`);
      } catch (e) { setError((e as Error).message); }
    });
  }

  function handleGiveItem() {
    if (!giveItemId) return;
    startTransition(async () => {
      try {
        await adminGiveItem(characterId, giveItemId, giveQty, giveRating || undefined, giveTier);
        notify('Item added to inventory');
      } catch (e) { setError((e as Error).message); }
    });
  }

  function handleRemove(instanceId: string) {
    if (!confirm('Remove this item?')) return;
    startTransition(async () => {
      try {
        await adminRemoveItem(instanceId, characterId);
        notify('Item removed');
      } catch (e) { setError((e as Error).message); }
    });
  }

  const inputCls = "px-2 py-1 text-sm bg-background border border-border rounded text-body focus:outline-none focus:ring-1 focus:ring-ring w-24";
  const btnCls = "px-3 py-1 text-xs bg-primary text-primary-foreground rounded hover:opacity-90 disabled:opacity-50 transition-opacity";

  return (
    <div className="space-y-4">
      {error && (
        <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-md text-sm text-destructive">{error}</div>
      )}
      {success && (
        <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-md text-sm text-green-400">{success}</div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Character Stats */}
        <Section title="Character Stats">
          <div className="space-y-2">
            {(Object.keys(charFields) as (keyof typeof charFields)[]).map(key => (
              <div key={key} className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground capitalize">{key.replace(/_/g, ' ')}</span>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={charFields[key]}
                    onChange={e => setCharFields(prev => ({ ...prev, [key]: Number(e.target.value) }))}
                    className={inputCls}
                  />
                </div>
              </div>
            ))}
            <button onClick={handleSaveChar} disabled={isPending} className={`${btnCls} mt-2`}>
              Save Stats
            </button>
          </div>
        </Section>

        {/* Attributes */}
        <Section title="Attributes (1–99)">
          <div className="space-y-2">
            {ATTRS.map(attr => (
              <div key={attr} className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground capitalize">{attr}</span>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1} max={99}
                    value={attrValues[attr]}
                    onChange={e => setAttrValues(prev => ({ ...prev, [attr]: Number(e.target.value) }))}
                    className={inputCls}
                  />
                  <button onClick={() => handleSaveAttr(attr)} disabled={isPending} className={btnCls}>
                    Set
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Section>
      </div>

      {/* Give Item */}
      <Section title="Give Item to Player">
        <div className="flex items-end gap-2 flex-wrap">
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Item</span>
            <select
              value={giveItemId}
              onChange={e => setGiveItemId(e.target.value)}
              className="px-3 py-1.5 text-sm bg-background border border-border rounded text-body focus:outline-none focus:ring-1 focus:ring-ring max-w-xs"
            >
              <option value="">Select item…</option>
              {allItems.map(it => (
                <option key={it.id} value={it.id}>{it.display_name} ({it.type})</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Qty</span>
            <input type="number" min={1} value={giveQty} onChange={e => setGiveQty(Number(e.target.value))}
              className="px-2 py-1.5 text-sm bg-background border border-border rounded text-body focus:outline-none focus:ring-1 focus:ring-ring w-20" />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Rating (equipment only)</span>
            <select value={giveRating} onChange={e => setGiveRating(e.target.value)}
              className="px-3 py-1.5 text-sm bg-background border border-border rounded text-body focus:outline-none focus:ring-1 focus:ring-ring">
              <option value="">None</option>
              {RATINGS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Tier</span>
            <input type="number" min={1} max={maxTier} value={giveTier}
              onChange={e => setGiveTier(Math.min(maxTier, Math.max(1, Number(e.target.value))))}
              className="px-2 py-1.5 text-sm bg-background border border-border rounded text-body focus:outline-none focus:ring-1 focus:ring-ring w-20" />
          </div>
          <button onClick={handleGiveItem} disabled={isPending || !giveItemId} className={`${btnCls} px-4 py-2`}>
            Give Item
          </button>
        </div>
      </Section>

      {/* Inventory */}
      <Section title={`Inventory (${inventory.length} items)`}>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="pb-1 text-left font-semibold">Item</th>
                <th className="pb-1 text-left font-semibold">Type</th>
                <th className="pb-1 text-left font-semibold">Qty</th>
                <th className="pb-1 text-left font-semibold">Rating</th>
                <th className="pb-1 text-left font-semibold">Tier</th>
                <th className="pb-1 text-left font-semibold">Slot</th>
                <th className="pb-1 text-right font-semibold">Remove</th>
              </tr>
            </thead>
            <tbody>
              {inventory.map(row => (
                <tr key={row.instance_id} className="border-b border-border/50 last:border-0">
                  <td className="py-1 text-body">{row.item_definitions?.display_name ?? row.item_id}</td>
                  <td className="py-1 text-muted-foreground">{row.item_definitions?.type ?? '?'}</td>
                  <td className="py-1 text-muted-foreground">{row.quantity}</td>
                  <td className="py-1 text-amber-400">{row.item_rating ?? '—'}</td>
                  <td className="py-1 text-muted-foreground">T{row.tier ?? 1}</td>
                  <td className="py-1 text-muted-foreground">{row.equipped_slot ?? 'bag'}</td>
                  <td className="py-1 text-right">
                    <button onClick={() => handleRemove(row.instance_id)} disabled={isPending}
                      className="text-destructive hover:underline text-xs disabled:opacity-50">×</button>
                  </td>
                </tr>
              ))}
              {inventory.length === 0 && (
                <tr><td colSpan={7} className="py-4 text-center text-muted-foreground">Empty inventory</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Section>

      {/* Stash */}
      <Section title={`Stash (${stash.length} stacks)`}>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="pb-1 text-left font-semibold">Item</th>
                <th className="pb-1 text-left font-semibold">Type</th>
                <th className="pb-1 text-left font-semibold">Qty</th>
                <th className="pb-1 text-left font-semibold">Rating</th>
                <th className="pb-1 text-right font-semibold">Remove</th>
              </tr>
            </thead>
            <tbody>
              {stash.map(row => (
                <tr key={row.instance_id} className="border-b border-border/50 last:border-0">
                  <td className="py-1 text-body">{row.item_definitions?.display_name ?? row.item_id}</td>
                  <td className="py-1 text-muted-foreground">{row.item_definitions?.type ?? '?'}</td>
                  <td className="py-1 text-muted-foreground">{row.quantity}</td>
                  <td className="py-1 text-amber-400">{row.item_rating ?? '—'}</td>
                  <td className="py-1 text-right">
                    <button onClick={() => handleRemove(row.instance_id)} disabled={isPending}
                      className="text-destructive hover:underline text-xs disabled:opacity-50">×</button>
                  </td>
                </tr>
              ))}
              {stash.length === 0 && (
                <tr><td colSpan={5} className="py-4 text-center text-muted-foreground">Empty stash</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Section>

      {/* Skills */}
      <Section title={`Skills (${skills.length})`}>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {skills.map(s => (
            <div key={s.skill_id} className="flex items-center justify-between text-xs bg-background border border-border rounded px-3 py-2">
              <span className="text-body">{s.skills?.display_name ?? s.skill_id}</span>
              <span className="font-bold text-heading">Lv. {s.level}</span>
            </div>
          ))}
          {skills.length === 0 && <div className="text-muted-foreground text-sm col-span-3">No skills yet</div>}
        </div>
      </Section>
    </div>
  );
}
