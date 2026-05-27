import React from 'react';

export type SelectableItem = {
  id: string;
  display_name: string;
  type: string;
  material_subtype?: string | null;
};

type Group = {
  label: string;
  items: SelectableItem[];
};

const GROUP_ORDER: { key: string; label: string }[] = [
  { key: 'raw',       label: '🪨 Raw Materials'     },
  { key: 'refined',   label: '⚙️ Refined Materials'  },
  { key: 'weapon',    label: '⚔️ Weapons'            },
  { key: 'armor',     label: '🛡️ Armor'              },
  { key: 'tool',      label: '🔧 Tools'              },
  { key: 'consumable',label: '🧪 Consumables'        },
  { key: 'recipe',    label: '📜 Recipes'             },
  { key: 'other',     label: '📦 Other'              },
];

function getGroupKey(item: SelectableItem): string {
  if (item.type === 'material') {
    return item.material_subtype === 'refined' ? 'refined' : 'raw';
  }
  if (['weapon', 'armor', 'tool', 'consumable', 'recipe'].includes(item.type)) return item.type;
  return 'other';
}

/**
 * Renders categorized <optgroup> elements for a <select> list of items.
 * Suppresses empty groups automatically.
 */
export function groupedItemOptions(items: SelectableItem[], placeholder?: string) {
  const buckets: Record<string, SelectableItem[]> = {};
  for (const item of items) {
    const key = getGroupKey(item);
    (buckets[key] ??= []).push(item);
  }

  const groups: Group[] = GROUP_ORDER
    .filter(g => buckets[g.key]?.length)
    .map(g => ({ label: g.label, items: buckets[g.key] }));

  return (
    <>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {groups.map(g => (
        <optgroup key={g.label} label={g.label}>
          {g.items.map(it => (
            <option key={it.id} value={it.id}>{it.display_name}</option>
          ))}
        </optgroup>
      ))}
    </>
  );
}
