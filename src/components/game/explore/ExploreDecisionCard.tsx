'use client';

import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { getResourceIconPath } from '@/lib/item-icon';
import type { DbExplorationEvent } from '@/types/game';
import type { ExploreAction } from '@/features/exploration/actions';

function capitalise(s: string) {
  return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function getItemIcon(item: string): string {
  const map: Record<string, string> = {
    logs: '🪵', wood: '🪵', planks: '🪵',
    stone: '🪨', cut_stone: '🪨',
    ore: '⛏️', metal: '⛏️', ingots: '🔩',
    hide: '🐾', leather: '🐾',
    herbs: '🌿', fiber: '🌿', cloth: '🧵',
    fish: '🐟', berries: '🍓',
  };
  for (const [k, v] of Object.entries(map)) {
    if (item.toLowerCase().includes(k)) return v;
  }
  return '📦';
}

const SKILL_LEVEL_REQ = [0, 15, 30, 50, 70];

interface Props {
  event: DbExplorationEvent;
  characterSkills: Record<string, number>;
  playerToolTier: number;
  pending: boolean;
  autoApprove: boolean;
  onAction: (action: ExploreAction) => void;
}

export function ExploreDecisionCard({
  event, characterSkills, playerToolTier, pending, autoApprove, onAction,
}: Props) {
  const pd = (event.data ?? {}) as Record<string, unknown>;
  const isResource = event.event_type === 'resource_found';
  const displayName = isResource
    ? String(pd.display_name ?? capitalise(String(pd.item ?? 'item')))
    : String(pd.enemy ?? 'Enemy');
  const icon = isResource ? getItemIcon(String(pd.item ?? '')) : '⚔️';

  const itemTier      = Number(pd.item_tier ?? 1);
  const reqToolTier   = Number(pd.required_tool_tier ?? Math.max(0, itemTier - 1));
  const reqSkillName  = String(pd.required_skill ?? '');
  const reqSkillLevel = Number(pd.required_skill_level ?? SKILL_LEVEL_REQ[itemTier - 1] ?? 0);
  const playerSkillLv = characterSkills[reqSkillName] ?? 0;

  let collectLocked = false;
  let lockReason = '';
  if (isResource) {
    if (playerToolTier < reqToolTier) {
      collectLocked = true;
      lockReason = `Needs Tier ${reqToolTier} tool`;
    } else if (playerSkillLv < reqSkillLevel) {
      collectLocked = true;
      const skillLabel = reqSkillName.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      lockReason = `Needs ${skillLabel} lv ${reqSkillLevel}`;
    }
  }

  const iconPath = isResource ? getResourceIconPath(String(pd.item ?? '')) : null;

  return (
    <div className="rounded-xl border border-primary/40 bg-primary/5 px-5 py-5 space-y-4">
      <div className="flex items-center gap-3">
        {iconPath
          ? <Image src={iconPath} alt={displayName} width={52} height={52} className="w-13 h-13 object-contain shrink-0" />
          : <span className="text-4xl">{icon}</span>}
        <div>
          <p className="text-lg font-bold text-foreground">
            {isResource ? `Found ${pd.quantity}× ${displayName}!` : `${displayName} appears!`}
          </p>
          <p className="text-xs text-muted-foreground">
            {isResource
              ? (collectLocked ? lockReason : 'Pick it up or leave it behind?')
              : 'Stand your ground or run?'}
          </p>
        </div>
      </div>
      <div className="flex gap-2">
        {isResource ? (
          <>
            <Button
              onClick={() => onAction('collect')}
              disabled={pending || collectLocked}
              className={`flex-1 h-11 text-base ${collectLocked ? 'opacity-40 cursor-not-allowed' : ''}`}
            >
              ✓ Collect
            </Button>
            <Button variant="outline" onClick={() => onAction('leave')} disabled={pending} className="flex-1 h-11 text-base">
              ✗ Leave
            </Button>
          </>
        ) : (
          <>
            <Button onClick={() => onAction('fight')} disabled={pending} className="flex-1 h-11 text-base">
              ⚔️ Fight
            </Button>
            <Button variant="outline" onClick={() => onAction('flee')} disabled={pending} className="flex-1 h-11 text-base">
              🏃 Flee <span className="text-xs opacity-60 ml-1">(50%)</span>
            </Button>
          </>
        )}
      </div>
      {autoApprove && (
        <p className="text-[10px] text-muted-foreground text-center">
          Auto-{isResource ? 'collecting' : 'fighting'}…
        </p>
      )}
    </div>
  );
}
