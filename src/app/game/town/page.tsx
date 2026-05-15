import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { GAME_CONFIG } from '@/config/game.config';
import type { DbFriend, DbArenaMatch } from '@/types/game';

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

  const [
    { data: friends },
    { data: pendingRequests },
    { data: arenaRating },
    { data: recentMatches },
    { data: worldBosses },
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
      .select('rating, wins, losses, streak')
      .eq('character_id', character.id)
      .single(),
    supabase
      .from('arena_matches')
      .select('winner_id, loser_id, winner_rating_change, loser_rating_change, ended_at')
      .or(`winner_id.eq.${character.id},loser_id.eq.${character.id}`)
      .order('ended_at', { ascending: false })
      .limit(5),
    supabase
      .from('world_bosses')
      .select('id, name, hp_remaining, max_hp, status, spawns_at')
      .in('status', ['spawning', 'active'])
      .order('spawns_at')
      .limit(3),
  ]);

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
          {/* Pending requests */}
          {(pendingRequests?.length ?? 0) > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Friend Requests ({pendingRequests!.length})
              </p>
              {pendingRequests!.map((req) => {
                const fromChar = req.characters as unknown as { name: string } | null;
                return (
                  <div key={req.id} className="flex items-center justify-between px-4 py-3 rounded-lg border border-primary/30 bg-primary/5">
                    <span className="text-sm font-medium">{fromChar?.name ?? 'Unknown'}</span>
                    <span className="text-xs text-muted-foreground">Pending acceptance</span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Friends list */}
          {(friends?.length ?? 0) === 0 ? (
            <EmptyState icon="🤝" message="No friends yet. You can send friend requests to other adventurers by name." />
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
                    <Badge variant="outline" className="text-xs">Online</Badge>
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
                const ratingChange = won ? match.winner_rating_change : match.loser_rating_change;
                return (
                  <div key={i} className="flex items-center justify-between px-4 py-2.5 rounded-lg border border-border bg-card">
                    <Badge variant={won ? 'default' : 'secondary'} className="text-xs">
                      {won ? 'Victory' : 'Defeat'}
                    </Badge>
                    <span className={`text-sm font-bold tabular-nums ${ratingChange >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {ratingChange > 0 ? '+' : ''}{ratingChange} pts
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(match.ended_at).toLocaleDateString()}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          <div className="rounded-lg border border-border/50 bg-card/50 p-4 text-center space-y-1">
            <p className="text-sm text-muted-foreground">
              Queue opens automatically. Matchmaking finds an opponent within level ±{GAME_CONFIG.arena.matchmakingLevelRange}.
              Times out after {GAME_CONFIG.arena.queueTimeoutSeconds}s.
            </p>
            <p className="text-xs text-muted-foreground">
              Win: +{GAME_CONFIG.arena.pointsPerWin} pts · Loss: −{GAME_CONFIG.arena.pointsPerLoss} pts
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

          {(worldBosses?.length ?? 0) === 0 ? (
            <EmptyState
              icon="💀"
              message={`No active world bosses. They spawn every ${GAME_CONFIG.worldBoss.spawnIntervalHours} hours. Check back soon.`}
            />
          ) : (
            <div className="space-y-3">
              {worldBosses!.map(boss => {
                const hpPct = Math.round((boss.hp_remaining / boss.max_hp) * 100);
                return (
                  <Card key={boss.id} className="border-red-500/20">
                    <CardContent className="pt-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="font-bold text-red-400">{boss.name}</p>
                        <Badge variant="destructive" className="text-xs capitalize">{boss.status}</Badge>
                      </div>
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>HP</span>
                          <span className="tabular-nums">{boss.hp_remaining.toLocaleString()} / {boss.max_hp.toLocaleString()}</span>
                        </div>
                        <div className="h-2 rounded-full bg-muted overflow-hidden">
                          <div className="h-full bg-red-500/70 transition-all" style={{ width: `${hpPct}%` }} />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
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
