'use client';

import { useState, useTransition } from 'react';
import { createWeaponType, deleteWeaponType } from '@/features/admin/weapon-type-actions';

type WeaponType = { id: string; name: string; display_name: string };

export function WeaponTypesClient({ initial }: { initial: WeaponType[] }) {
  const [types, setTypes] = useState<WeaponType[]>(initial);
  const [name, setName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleCreate() {
    if (!name.trim() || !displayName.trim()) return;
    startTransition(async () => {
      try {
        await createWeaponType(name, displayName);
        setTypes(prev => [...prev, {
          id: crypto.randomUUID(),
          name: name.trim().toLowerCase().replace(/\s+/g, '_'),
          display_name: displayName.trim(),
        }]);
        setName('');
        setDisplayName('');
        setError(null);
      } catch (e) {
        setError((e as Error).message);
      }
    });
  }

  function handleDelete(id: string, label: string) {
    if (!confirm(`Delete weapon type "${label}"? Any weapons or ultimates using it will lose this tag.`)) return;
    startTransition(async () => {
      try {
        await deleteWeaponType(id);
        setTypes(prev => prev.filter(t => t.id !== id));
        setError(null);
      } catch (e) {
        setError((e as Error).message);
      }
    });
  }

  return (
    <div className="space-y-5 max-w-xl">
      {error && (
        <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-md text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Create form */}
      <div className="bg-card border border-border rounded-lg p-5 space-y-4">
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">New Weapon Type</p>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Internal Slug</span>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="two_handed_sword"
              className="px-3 py-2 text-sm bg-background border border-border rounded-md text-body placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Display Name</span>
            <input
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              placeholder="Two-Handed Sword"
              className="px-3 py-2 text-sm bg-background border border-border rounded-md text-body placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </label>
        </div>
        <button
          onClick={handleCreate}
          disabled={isPending || !name.trim() || !displayName.trim()}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {isPending ? 'Creating…' : '+ Add Weapon Type'}
        </button>
      </div>

      {/* List */}
      <div className="bg-card border border-border rounded-lg divide-y divide-border">
        {types.length === 0 && (
          <p className="p-5 text-sm text-muted-foreground italic">No weapon types yet.</p>
        )}
        {types.map(t => (
          <div key={t.id} className="flex items-center justify-between px-5 py-3">
            <div>
              <span className="text-sm font-medium text-body">{t.display_name}</span>
              <span className="ml-2 text-xs text-muted-foreground font-mono">{t.name}</span>
            </div>
            <button
              onClick={() => handleDelete(t.id, t.display_name)}
              disabled={isPending}
              className="text-xs px-3 py-1 text-destructive border border-destructive/30 rounded hover:bg-destructive/10 transition-colors disabled:opacity-50"
            >
              Delete
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
