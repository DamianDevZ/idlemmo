import { requireAdmin } from '@/lib/admin-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { PlayerDetailClient } from '@/components/admin/PlayerDetailClient';

export default async function PlayerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id: characterId } = await params;
  const db = createAdminClient();

  const [
    { data: character },
    { data: attrs },
    { data: inventory },
    { data: stash },
    { data: skills },
    { data: authUsers },
    { data: items },
    maxTierRow,
  ] = await Promise.all([
    db.from('characters').select('*').eq('id', characterId).single(),
    db.from('character_attributes').select('*').eq('character_id', characterId).single(),
    db.from('character_inventory')
      .select('instance_id, item_id, quantity, equipped_slot, item_rating, tier, item_definitions(display_name, type, equipment_tier)')
      .eq('character_id', characterId)
      .order('equipped_slot', { ascending: false, nullsFirst: false }),
    db.from('character_stash')
      .select('instance_id, item_id, quantity, item_rating, item_definitions(display_name, type)')
      .eq('character_id', characterId),
    db.from('character_skills')
      .select('skill_id, level, xp_toward_next_level, skills(display_name)')
      .eq('character_id', characterId)
      .order('level', { ascending: false }),
    db.auth.admin.listUsers(),
    db.from('item_definitions').select('id, display_name, type').order('display_name'),
    db.from('game_config').select('value').eq('key', 'max_tier').single(),
  ]);

  if (!character) notFound();

  const maxTier = (maxTierRow?.data?.value as number | null) ?? 10;

  const user = (authUsers?.users ?? []).find(u => u.id === character.user_id);

  // Analytics for this user
  const { data: analytics } = await db
    .from('player_analytics')
    .select('country, browser, device_type, os, logged_at')
    .eq('user_id', character.user_id)
    .order('logged_at', { ascending: false })
    .limit(1)
    .single();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/admin/players" className="text-sm text-muted-foreground hover:text-body transition-colors">← Ledger</Link>
        <span className="text-muted-foreground">/</span>
        <h1 className="text-xl font-bold text-heading">{character.name}</h1>
        <span className="text-sm text-muted-foreground">Lv. {character.main_level}</span>
      </div>

      {/* User info banner */}
      <div className="bg-card border border-border rounded-lg p-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        <div>
          <div className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">Email</div>
          <div className="text-body">{user?.email ?? '—'}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">Registered</div>
          <div className="text-body">{user?.created_at ? new Date(user.created_at).toLocaleString() : '—'}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">Last Login</div>
          <div className="text-body">{user?.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleString() : '—'}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">Device</div>
          <div className="text-body">{analytics ? `${analytics.country ?? ''} ${analytics.device_type ?? ''} ${analytics.browser ?? ''}`.trim() : '—'}</div>
        </div>
      </div>

      <PlayerDetailClient
        characterId={characterId}
        character={character}
        attrs={attrs}
            inventory={((inventory ?? []) as unknown as Parameters<typeof PlayerDetailClient>[0]['inventory'])}
        stash={((stash ?? []) as unknown as Parameters<typeof PlayerDetailClient>[0]['stash'])}
        skills={((skills ?? []) as unknown as Parameters<typeof PlayerDetailClient>[0]['skills'])}
        allItems={items ?? []}
        maxTier={maxTier}
      />
    </div>
  );
}
