import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { GAME_CONFIG } from '@/config/game.config';
import { FriendRequestCard } from '@/components/game/FriendRequestCard';
import { AddFriendForm } from '@/components/game/AddFriendForm';
import { ArenaQueueButton } from '@/components/game/ArenaQueueButton';
import { WorldBossPanel } from '@/components/game/WorldBossPanel';

export const dynamic = 'force-dynamic';

export default async function TownPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: character } = await supabase
    .from('characters')
    .select('id, name')
    .eq('user_id', user.id)
    .single();

  if (!character) redirect('/create-character');

  // Lazily transition boss states and spawn a new boss if none is active.
  // This runs on every page load — the function is idempotent and fast.
  await supabase.rpc('ensure_world_boss');

  const [
    { data: friends },
    { data: pendingRequests },
    { data: arenaRating },
    { data: recentMatches },
    { data: worldBosses },
    { data: queueEntry },
  ] = await Promise.all([
    supabase
      .from('friends')
      .select('friend_character_id, characters!friends_friend_character_id_fkey(name, main_level)')
      .eq('character_id', character.id),
    supabase
      .from('friend_requests')
      .select('id, from_character_id, characters!friend_requests_from_character_id_fkey(name)')
      .eq('to_character_id', character.id)
      .eq('status', 'pending'),
    supabase
      .from('arena_ratings')
      .select('rating, wins, losses')
      .eq('character_id', character.id)
      .single(),
    supabase
      .from('arena_matches')
      .select('winner_id, player1_id, player2_id, player1_rating_delta, player2_rating_delta, completed_at')
      .or(`player1_id.eq.${character.id},player2_id.eq.${character.id}`)
      .order('completed_at', { ascending: false })
      .limit(5),
    supabase
      .from('world_bosses')
      .select('id, name, current_hp, max_hp, status, spawns_at, queue_closes_at')
      .in('status', ['queuing', 'in_progress'])
      .order('spawns_at')
      .limit(3),
    supabase
      .from('arena_queue')
      .select('character_id')
      .eq('character_id', character.id)
      .gt('expires_at', new Date().toISOString())
      .single(),
  ]);

  // For the active boss (if any): check if the character has joined and get their last attack time
  const activeBoss = worldBosses?.[0] ?? null;
  let bossParticipant: { last_attack_at: string | null } | null = null;
  let bossParticipantCount = 0;

  if (activeBoss) {
    const [{ data: part }, { count }] = await Promise.all([
      supabase
        .from('world_boss_participants')
        .select('last_attack_at')
        .eq('boss_id', activeBoss.id)
        .eq('character_id', character.id)
        .maybeSingle(),
      supabase
        .from('world_boss_participants')
        .select('*', { count: 'exact', head: true })
        .eq('boss_id', activeBoss.id),
    ]);
    bossParticipant = part;
    bossParticipantCount = count ?? 0;
  }

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto space-y-4">
      <div>
        <h2 className="text-2xl font-black text-primary">🏘️ Town</h2>
        <p className="text-muted-foreground text-sm">The common ground. Find allies, compete in the arena, and battle world bosses.</p>
      </div>

      <Tabs defaultValue="friends">
        <TabsList className="w-full grid grid-cols-3">
          <TabsTrigger value="friends">
            Friends
            {(pendingRequests?.length ?? 0) > 0 && (
              <Badge className="ml-2 text-xs bg-primary text-primary-foreground">{pendingRequests!.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="arena">Arena</TabsTrigger>
          <TabsTrigger value="worldboss">World Boss</TabsTrigger>
        </TabsList>

        {/* ── Friends ── */}
        <TabsContent value="friends" className="mt-4 space-y-4">
          {/* Add friend */}
          <div className="space-y-1">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Add Friend</p>
            <AddFriendForm />
          </div>

          {/* Pending requests */}
          {(pendingRequests?.length ?? 0) > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Friend Requests ({pendingRequests!.length})
              </p>
              {pendingRequests!.map((req) => {
                const fromChar = req.characters as unknown as { name: string } | null;
                return (
                  <FriendRequestCard
                    key={req.id}
                    requestId={req.id}
                    fromName={fromChar?.name ?? 'Unknown'}
                  />
                );
              })}
            </div>
          )}

          {/* Friends list */}
          {(friends?.length ?? 0) === 0 ? (
            <EmptyState icon="🤝" message="No friends yet. Search for an adventurer by name above." />
          ) : (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Friends ({friends!.length})
              </p>
              {friends!.map((f) => {
                const friendChar = f.characters as unknown as { name: string; main_level: number } | null;
                return (
                  <div key={f.friend_character_id} className="flex items-center justify-between px-4 py-3 rounded-lg border border-border bg-card">
                    <div>
                      <p className="text-sm font-semibold">{friendChar?.name ?? 'Unknown'}</p>
                      <p className="text-xs text-muted-foreground">Level {friendChar?.main_level ?? '?'}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ── Arena ── */}
        <TabsContent value="arena" className="mt-4 space-y-4">
          {/* Rating card */}
          <Card className="border-border/60">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">⚔ Your Arena Standing</CardTitle>
              <CardDescription className="text-xs">
                1v1 PvP · Level range ±{GAME_CONFIG.arena.matchmakingLevelRange}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {arenaRating ? (
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <p className="text-2xl font-black text-primary tabular-nums">{arenaRating.rating}</p>
                    <p className="text-xs text-muted-foreground">Rating</p>
                  </div>
                  <div>
                    <p className="text-2xl font-black text-green-400 tabular-nums">{arenaRating.wins}</p>
                    <p className="text-xs text-muted-foreground">Wins</p>
                  </div>
                  <div>
                    <p className="text-2xl font-black text-red-400 tabular-nums">{arenaRating.losses}</p>
                    <p className="text-xs text-muted-foreground">Losses</p>
                  </div>
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">You have not entered the arena yet.</p>
              )}
            </CardContent>
          </Card>

          {/* Recent matches */}
          {(recentMatches?.length ?? 0) > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Recent Matches</p>
              {recentMatches!.map((match, i) => {
                const won = match.winner_id === character.id;
                // Determine which delta belongs to us
                const isPlayer1 = match.player1_id === character.id;
                const ratingChange = isPlayer1 ? match.player1_rating_delta : match.player2_rating_delta;
                return (
                  <div key={i} className="flex items-center justify-between px-4 py-2.5 rounded-lg border border-border bg-card">
                    <Badge variant={won ? 'default' : 'secondary'} className="text-xs">
                      {won ? 'Victory' : 'Defeat'}
                    </Badge>
                    <span className={`text-sm font-bold tabular-nums ${(ratingChange ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {(ratingChange ?? 0) > 0 ? '+' : ''}{ratingChange ?? 0} pts
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {match.completed_at ? new Date(match.completed_at).toLocaleDateString() : '—'}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          <ArenaQueueButton characterId={character.id} isQueued={!!queueEntry} />

          <div className="rounded-lg border border-border/50 bg-card/50 p-4 text-center space-y-1">
            <p className="text-xs text-muted-foreground">
              Win: +{GAME_CONFIG.arena.pointsPerWin} pts · Loss: −{GAME_CONFIG.arena.pointsPerLoss} pts ·
              Timeout: {GAME_CONFIG.arena.queueTimeoutSeconds}s · Level range ±{GAME_CONFIG.arena.matchmakingLevelRange}
            </p>
          </div>
        </TabsContent>

        {/* ── World Boss ── */}
        <TabsContent value="worldboss" className="mt-4 space-y-4">
          <Card className="border-border/60">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">🐉 World Bosses</CardTitle>
              <CardDescription className="text-xs">
                Spawn every {GAME_CONFIG.worldBoss.spawnIntervalHours}h · {GAME_CONFIG.worldBoss.minPlayers}–{GAME_CONFIG.worldBoss.maxPlayers} players
              </CardDescription>
            </CardHeader>
          </Card>

          {activeBoss ? (
            <WorldBossPanel
              boss={activeBoss}
              characterId={character.id}
              isParticipant={!!bossParticipant}
              lastAttackAt={bossParticipant?.last_attack_at ?? null}
              participantCount={bossParticipantCount}
            />
          ) : (
            <EmptyState
              icon="💀"
              message={`No active world bosses. They spawn every ${GAME_CONFIG.worldBoss.spawnIntervalHours} hours. Check back soon.`}
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function EmptyState({ icon, message }: { icon: string; message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center space-y-2">
      <span className="text-4xl">{icon}</span>
      <p className="text-muted-foreground text-sm max-w-xs">{message}</p>
    </div>
  );
}
