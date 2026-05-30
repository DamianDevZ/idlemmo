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

// Preferred display order + labels for known group keys.
// Any type not listed here is auto-appended, so new item types need no code changes.
const KNOWN_GROUP_ORDER: { key: string; label: string }[] = [
  { key: 'raw',          label: '🪨 Raw Materials'     },
  { key: 'refined',      label: '⚙️ Refined Materials'  },
  { key: 'weapon',       label: '⚔️ Weapons'            },
  { key: 'armor',        label: '🛡️ Armor'              },
  { key: 'tool',         label: '🔧 Tools'              },
  { key: 'consumable',   label: '🧪 Consumables'        },
  { key: 'unique',       label: '💎 Unique'             },
  { key: 'recipe',       label: '📜 Recipes'            },
  { key: 'special_attack', label: '✨ Ultimates'        },
  { key: 'misc',         label: '📦 Misc'               },
];
const KNOWN_GROUP_MAP = Object.fromEntries(KNOWN_GROUP_ORDER.map(g => [g.key, g.label]));

function getGroupKey(item: SelectableItem): string {
  if (item.type === 'material') {
    return item.material_subtype === 'refined' ? 'refined' : 'raw';
  }
  return item.type;
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

  // Known types in preferred order, then any unknown types auto-appended
  const knownKeys = new Set(KNOWN_GROUP_ORDER.map(g => g.key));
  const extraKeys = Object.keys(buckets).filter(k => !knownKeys.has(k)).sort();
  const groups: Group[] = [
    ...KNOWN_GROUP_ORDER
      .filter(g => buckets[g.key]?.length)
      .map(g => ({ label: g.label, items: buckets[g.key] })),
    ...extraKeys.map(k => ({
      label: KNOWN_GROUP_MAP[k] ?? (k.charAt(0).toUpperCase() + k.slice(1).replace(/_/g, ' ')),
      items: buckets[k],
    })),
  ];

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
