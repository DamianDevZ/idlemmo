'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { GAME_CONFIG } from '@/config/game.config';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { AttributeName } from '@/types/game';

const C = GAME_CONFIG.character;
const A = GAME_CONFIG.attributes;

const ATTRIBUTES: { name: AttributeName; label: string; icon: string; description: string }[] = [
  { name: 'vigor',        icon: '❤️', label: 'Vigor',        description: `Max HP +${A.hpPerVigor} per point` },
  { name: 'endurance',    icon: '🏃', label: 'Endurance',     description: `+${A.slotsPerEndurance} carry slots per point` },
  { name: 'strength',     icon: '⚔️', label: 'Strength',      description: 'Melee damage & gather yield' },
  { name: 'dexterity',    icon: '🏹', label: 'Dexterity',     description: 'Attack speed, gather speed & crit chance' },
  { name: 'intelligence', icon: '🔮', label: 'Intelligence',  description: 'Magic damage & refining efficiency' },
  { name: 'faith',        icon: '✨', label: 'Faith',         description: 'Craft success chance & HP regen' },
  { name: 'arcane',       icon: '🌙', label: 'Arcane',        description: 'Rare item discovery & quality finds' },
];

const DEFAULT_ATTRS: Record<AttributeName, number> = {
  vigor: C.startingAttributeValue,
  endurance: C.startingAttributeValue,
  strength: C.startingAttributeValue,
  dexterity: C.startingAttributeValue,
  intelligence: C.startingAttributeValue,
  faith: C.startingAttributeValue,
  arcane: C.startingAttributeValue,
};

export default function CreateCharacterPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [attrs, setAttrs] = useState<Record<AttributeName, number>>(DEFAULT_ATTRS);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const pointsSpent = Object.values(attrs).reduce((a, b) => a + b, 0) -
    ATTRIBUTES.length * C.startingAttributeValue;
  const pointsLeft = C.creationBonusPoints - pointsSpent;

  function adjust(attr: AttributeName, delta: number) {
    const next = attrs[attr] + delta;
    if (next < C.startingAttributeValue) return;
    if (next > A.maxValue) return;
    if (delta > 0 && pointsLeft <= 0) return;
    setAttrs(prev => ({ ...prev, [attr]: next }));
  }

  const maxHp = A.baseHp + attrs.vigor * A.hpPerVigor;
  const carrySlots = A.baseCarrySlots + attrs.endurance * A.slotsPerEndurance;

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!name.trim() || name.trim().length < 2) {
      setError('Name must be at least 2 characters');
      return;
    }
    if (name.trim().length > 24) {
      setError('Name must be at most 24 characters');
      return;
    }
    setLoading(true);

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push('/login'); return; }

    const { data: character, error: charErr } = await supabase
      .from('characters')
      .insert({ user_id: user.id, name: name.trim() })
      .select('id')
      .single();

    if (charErr) {
      setError(charErr.message.includes('unique') ? 'You already have a character' : charErr.message);
      setLoading(false);
      return;
    }

    const { error: attrErr } = await supabase
      .from('character_attributes')
      .insert({ character_id: character.id, ...attrs });

    if (attrErr) { setError(attrErr.message); setLoading(false); return; }

    // Seed category-point rows for all skill categories so XP can accumulate.
    // We do this client-side after character creation since there's no server action here.
    const { data: categories } = await supabase.from('skill_categories').select('id');
    if (categories && categories.length > 0) {
      await supabase.from('character_category_points').insert(
        categories.map(cat => ({
          character_id: character.id,
          category_id:  cat.id,
          xp_current:          0,
          points_available:    0,
          points_total_earned: 0,
        }))
      );
    }

    router.push('/game');
    router.refresh();
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Atmospheric background text */}
      <div className="absolute inset-0 flex items-center justify-center opacity-[0.03] pointer-events-none select-none">
        <span className="text-[20rem] font-black text-primary">⚔</span>
      </div>

      <div className="w-full max-w-xl space-y-6 relative z-10">
        {/* Title */}
        <div className="text-center space-y-1">
          <p className="text-xs tracking-[0.3em] uppercase text-muted-foreground">Your legend begins</p>
          <h1 className="text-4xl font-black text-primary tracking-tight">Create Character</h1>
          <p className="text-muted-foreground text-sm">
            Distribute {C.creationBonusPoints} points across your starting attributes
          </p>
        </div>

        <form onSubmit={handleCreate} className="space-y-4">
          {/* Name */}
          <Card className="border-border/60">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm uppercase tracking-widest text-muted-foreground">Name</CardTitle>
            </CardHeader>
            <CardContent>
              <Input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="What shall you be called?"
                maxLength={24}
                required
                className="text-lg"
              />
            </CardContent>
          </Card>

          {/* Attributes */}
          <Card className="border-border/60">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm uppercase tracking-widest text-muted-foreground">Attributes</CardTitle>
                <Badge variant={pointsLeft === 0 ? 'default' : 'secondary'} className="tabular-nums">
                  {pointsLeft} left
                </Badge>
              </div>
              <CardDescription className="text-xs">
                Base: {C.startingAttributeValue} · Max: {A.maxValue}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {ATTRIBUTES.map(({ name: attr, icon, label, description }) => (
                <div key={attr} className="flex items-center gap-3 py-1">
                  <span className="text-lg w-6 shrink-0 text-center">{icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold">{label}</span>
                      <span className="text-primary font-black tabular-nums text-lg w-8 text-center">
                        {attrs[attr]}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground">{description}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => adjust(attr, -1)}
                      disabled={attrs[attr] <= C.startingAttributeValue}
                      className="w-7 h-7 rounded border border-border text-muted-foreground hover:text-foreground hover:border-primary/50 disabled:opacity-30 disabled:cursor-not-allowed text-sm transition-colors"
                    >−</button>
                    <button
                      type="button"
                      onClick={() => adjust(attr, 1)}
                      disabled={pointsLeft <= 0 || attrs[attr] >= A.maxValue}
                      className="w-7 h-7 rounded border border-border text-muted-foreground hover:text-foreground hover:border-primary/50 disabled:opacity-30 disabled:cursor-not-allowed text-sm transition-colors"
                    >+</button>
                  </div>
                </div>
              ))}

              {/* Live preview */}
              <div className="mt-3 pt-3 border-t border-border/60 flex gap-6 text-sm">
                <span className="text-muted-foreground">HP <strong className="text-foreground ml-1">{maxHp}</strong></span>
                <span className="text-muted-foreground">Carry <strong className="text-foreground ml-1">{carrySlots} slots</strong></span>
              </div>
            </CardContent>
          </Card>

          {error && (
            <p className="text-destructive text-sm text-center">{error}</p>
          )}

          <Button
            type="submit"
            className="w-full h-12 text-base font-bold tracking-wide"
            disabled={loading || pointsLeft !== 0}
          >
            {loading ? 'Creating…' : '⚔ Enter the Realm'}
          </Button>

          {pointsLeft !== 0 && (
            <p className="text-center text-xs text-muted-foreground">
              You have {pointsLeft} unspent point{pointsLeft !== 1 ? 's' : ''} — allocate all to continue
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
