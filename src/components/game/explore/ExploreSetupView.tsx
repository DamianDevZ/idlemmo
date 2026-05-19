'use client';

import { Button } from '@/components/ui/button';

interface Area {
  id: string;
  display_name: string;
  description: string;
  icon: string;
  image_url: string | null;
}

interface Props {
  areas: Area[];
  areaTiers: Record<string, number[]>;
  selectedArea: string;
  onSelectArea: (id: string, firstTier: number) => void;
  selectedTier: number;
  onSelectTier: (tier: number) => void;
  retreatHp: number;
  onRetreatHpChange: (v: number) => void;
  pending: boolean;
  tiersForSelected: number[];
  onStart: () => void;
  error: string;
  deathInfo: { droppedItems: Array<{ name: string; quantity: number }> } | null;
  onDismissDeath: () => void;
}

export function ExploreSetupView({
  areas, areaTiers, selectedArea, onSelectArea, selectedTier, onSelectTier,
  retreatHp, onRetreatHpChange, pending, tiersForSelected, onStart,
  error, deathInfo, onDismissDeath,
}: Props) {
  return (
    <div className="p-4 md:p-6 space-y-5 max-w-2xl mx-auto">
      <div>
        <h2 className="text-2xl font-bold text-primary">Explore</h2>
        <p className="text-muted-foreground text-sm">Choose a location and set out. The game runs automatically.</p>
      </div>

      {/* Death overlay — shown when character HP hits 0 during exploration */}
      {deathInfo && (
        <div className="rounded-xl border-2 border-red-500/50 bg-red-500/10 px-5 py-5 space-y-3 text-center">
          <p className="text-3xl">💀</p>
          <h3 className="text-lg font-bold text-red-400">You died</h3>
          <p className="text-sm text-muted-foreground">
            You have been revived at full HP — but everything you were carrying is gone.
            Items safely stored in your stash are untouched.
          </p>
          {deathInfo.droppedItems.length > 0 && (
            <div className="text-xs text-red-300/80 space-y-0.5">
              <p className="font-semibold text-red-400 mb-1">Items lost:</p>
              {deathInfo.droppedItems.map((i, idx) => (
                <p key={idx}>{i.quantity}× {i.name}</p>
              ))}
            </div>
          )}
          <button onClick={onDismissDeath} className="mt-2 text-xs text-muted-foreground hover:text-body underline">
            Dismiss
          </button>
        </div>
      )}

      {error && (
        <div className="rounded-md bg-destructive/10 border border-destructive/30 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {areas.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">No areas have been configured yet.</p>
      ) : (
        <div className="space-y-3">
          {areas.map(area => {
            const isSelected = selectedArea === area.id;
            const tiers = areaTiers[area.id] ?? [];
            return (
              <div
                key={area.id}
                className={`rounded-xl overflow-hidden border-2 transition-all cursor-pointer ${
                  isSelected ? 'border-primary' : 'border-border hover:border-primary/40'
                }`}
                onClick={() => onSelectArea(area.id, tiers[0] ?? 1)}
              >
                {/* Image banner with text overlay */}
                <div className="relative">
                  {area.image_url
                    ? <img src={area.image_url} alt="" className="w-full block" />
                    : <div className="w-full bg-gradient-to-r from-primary/20 to-accent/30" style={{ paddingBottom: '40%' }} />
                  }
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
                  <div className="absolute inset-0 px-4 py-3 flex items-end">
                    <span className="text-3xl mr-3 leading-none drop-shadow">{area.icon}</span>
                    <div>
                      <h3 className="font-bold text-white text-lg leading-tight drop-shadow">{area.display_name}</h3>
                      {area.description && (
                        <p className="text-sm text-white/75 line-clamp-1 drop-shadow">{area.description}</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Tier picker — only visible when this area is selected */}
                {isSelected && (
                  <div className="bg-card p-3 space-y-3" onClick={e => e.stopPropagation()}>
                    {tiers.length > 0 ? (
                      <div className="grid grid-cols-5 gap-2">
                        {tiers.map(t => {
                          const active = selectedTier === t;
                          return (
                            <button
                              key={t}
                              onClick={() => onSelectTier(t)}
                              className={`rounded-md border p-2.5 text-center transition-colors text-xs min-h-[60px] ${
                                active
                                  ? 'border-primary bg-primary/10 text-primary'
                                  : 'border-border hover:border-primary/50 text-foreground'
                              }`}
                            >
                              <div className="font-semibold">T{t}</div>
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground italic py-1">This area is not yet available for exploration.</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Retreat HP slider */}
      <div className="space-y-2">
        <div className="flex justify-between">
          <p className="text-sm font-medium">Auto-retreat at</p>
          <span className="text-sm text-primary font-bold">{retreatHp}% HP</span>
        </div>
        <input
          type="range" min={0} max={80} step={5}
          value={retreatHp}
          onChange={e => onRetreatHpChange(Number(e.target.value))}
          className="w-full accent-primary"
        />
        <p className="text-xs text-muted-foreground">
          Set to 0 to never auto-retreat. Higher values mean safer but shorter runs.
        </p>
      </div>

      <Button
        className="w-full"
        size="lg"
        onClick={onStart}
        disabled={pending || !selectedArea || tiersForSelected.length === 0}
      >
        {pending ? 'Starting…' : '⚔️ Begin Exploration'}
      </Button>
    </div>
  );
}
