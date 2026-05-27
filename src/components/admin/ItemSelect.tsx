'use client';

import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';

export type SelectableItem = {
  id: string;
  display_name: string;
  type: string;
  material_subtype?: string | null;
};

const GROUPS = [
  { key: 'raw',        label: '🪨 Raw Materials'    },
  { key: 'refined',    label: '⚙️ Refined Materials' },
  { key: 'weapon',     label: '⚔️ Weapons'           },
  { key: 'armor',      label: '🛡️ Armor'             },
  { key: 'tool',       label: '🔧 Tools'             },
  { key: 'consumable', label: '🧪 Consumables'       },
  { key: 'other',      label: '📦 Other'             },
];

function getGroupKey(item: SelectableItem): string {
  if (item.type === 'material') return item.material_subtype === 'refined' ? 'refined' : 'raw';
  if (['weapon', 'armor', 'tool', 'consumable'].includes(item.type)) return item.type;
  return 'other';
}

export function ItemSelect({
  value,
  onChange,
  items,
  placeholder = 'Select item…',
  className,
}: {
  value: string;
  onChange: (id: string) => void;
  items: SelectableItem[];
  placeholder?: string;
  className?: string;
}) {
  const selected = items.find(i => i.id === value);

  // Group items into buckets
  const buckets: Record<string, SelectableItem[]> = {};
  for (const item of items) {
    const key = getGroupKey(item);
    (buckets[key] ??= []).push(item);
  }
  const groups = GROUPS.filter(g => buckets[g.key]?.length);

  // Default: expand only the group containing the current value
  const defaultExpanded = () => {
    const initial: Record<string, boolean> = {};
    if (value) {
      const sel = items.find(i => i.id === value);
      if (sel) initial[getGroupKey(sel)] = true;
    }
    return initial;
  };

  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>(defaultExpanded);
  const [panelStyle, setPanelStyle] = useState<React.CSSProperties>({});
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const ref = useRef<HTMLDivElement>(null);

  // Reset expanded state when the dropdown opens (re-expand the selected group)
  function handleOpen() {
    setExpanded(defaultExpanded());
    setOpen(true);
  }

  // Position the portal panel relative to the trigger button, flipping above if
  // there isn't enough room below the viewport.
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    const panelH = panelRef.current?.offsetHeight ?? 300;
    const spaceBelow = window.innerHeight - r.bottom;
    const showAbove = spaceBelow < panelH + 8 && r.top > panelH + 8;
    setPanelStyle({
      position: 'fixed',
      left: r.left,
      width: Math.max(r.width, 208),
      zIndex: 9999,
      ...(showAbove
        ? { bottom: window.innerHeight - r.top + 4 }
        : { top: r.bottom + 4 }),
    });
  }, [open]);

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (
        ref.current && !ref.current.contains(e.target as Node) &&
        panelRef.current && !panelRef.current.contains(e.target as Node)
      ) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  function toggleGroup(key: string) {
    setExpanded(prev => ({ ...prev, [key]: !prev[key] }));
  }

  function select(id: string) {
    onChange(id);
    setOpen(false);
  }

  return (
    <div ref={ref} className={`relative ${className ?? ''}`}>
      {/* Trigger */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (open ? setOpen(false) : handleOpen())}
        className="w-full text-left px-2 py-1 text-xs bg-background border border-border rounded text-body
          focus:outline-none focus:ring-1 focus:ring-ring flex items-center justify-between gap-1 min-w-0"
      >
        <span className={`truncate ${selected ? 'text-body' : 'text-muted-foreground'}`}>
          {selected?.display_name ?? placeholder}
        </span>
        <span className="text-muted-foreground shrink-0 text-[10px]">{open ? '▴' : '▾'}</span>
      </button>

      {/* Dropdown panel — rendered in a portal so no ancestor overflow clips it */}
      {open && createPortal(
        <div
          ref={panelRef}
          style={panelStyle}
          className="bg-card border border-border rounded-md shadow-lg overflow-hidden"
        >
          {/* Clear / placeholder row */}
          <button
            type="button"
            onClick={() => select('')}
            className="w-full text-left px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent/40 transition-colors"
          >
            {placeholder}
          </button>

          <div className="border-t border-border/50" />

          {groups.map(g => {
            const isExpanded = !!expanded[g.key];
            return (
              <div key={g.key}>
                {/* Category header — acts as a sub-dropdown toggle */}
                <button
                  type="button"
                  onClick={() => toggleGroup(g.key)}
                  className="w-full text-left px-3 py-1.5 text-xs font-semibold text-muted-foreground
                    hover:bg-accent/30 transition-colors flex items-center justify-between"
                >
                  <span>{g.label}</span>
                  <span className="text-[10px] text-muted-foreground">{isExpanded ? '▾' : '▸'}</span>
                </button>

                {/* Items within the expanded category */}
                {isExpanded && (
                  <div className="border-t border-border/20">
                    {buckets[g.key].map(item => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => select(item.id)}
                        className={`w-full text-left pl-6 pr-3 py-1 text-xs transition-colors
                          ${item.id === value
                            ? 'bg-primary/10 text-primary font-medium'
                            : 'text-body hover:bg-accent/40'
                          }`}
                      >
                        {item.display_name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>,
        document.body
      )}
    </div>
  );
}
