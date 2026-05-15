import { requireAdmin } from '@/lib/admin-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import Link from 'next/link';

function formatDuration(seconds: number) {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

function timeAgo(date: string | null) {
  if (!date) return '—';
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export default async function AdminPlayersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const db = createAdminClient();

  // Get all characters with their user info
  let charQuery = db
    .from('characters')
    .select('id, name, main_level, main_xp, current_hp, created_at, updated_at, user_id')
    .order('created_at', { ascending: false });

  if (params.q) charQuery = charQuery.ilike('name', `%${params.q}%`);

  const { data: characters } = await charQuery;

  if (!characters?.length) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold text-heading">Player Ledger</h1>
        <p className="text-muted-foreground text-sm">No players found.</p>
      </div>
    );
  }

  // Fetch user emails from auth.users via admin client
  const userIds = [...new Set(characters.map(c => c.user_id))];
  const { data: authUsers } = await db.auth.admin.listUsers();
  const userMap = Object.fromEntries(
    (authUsers?.users ?? []).map(u => [u.id, { email: u.email, created_at: u.created_at, last_sign_in_at: u.last_sign_in_at }])
  );

  // Total play time per character (sum of ended_at - started_at where ended_at not null)
  const { data: sessionAgg } = await db
    .from('exploration_sessions')
    .select('character_id, started_at, ended_at, status')
    .in('character_id', characters.map(c => c.id));

  const playTimeMap: Record<string, number> = {};
  const lastSessionMap: Record<string, { date: string; duration: number | null }> = {};
  for (const s of sessionAgg ?? []) {
    const dur = s.ended_at ? (new Date(s.ended_at).getTime() - new Date(s.started_at).getTime()) / 1000 : null;
    playTimeMap[s.character_id] = (playTimeMap[s.character_id] ?? 0) + (dur ?? 0);
    const prev = lastSessionMap[s.character_id];
    if (!prev || new Date(s.started_at) > new Date(prev.date)) {
      lastSessionMap[s.character_id] = { date: s.started_at, duration: dur };
    }
  }

  // Most recent analytics event per user
  const { data: analytics } = await db
    .from('player_analytics')
    .select('user_id, country, browser, device_type, os, logged_at')
    .in('user_id', userIds)
    .order('logged_at', { ascending: false });

  const analyticsMap: Record<string, { user_id: string; country: string | null; browser: string | null; device_type: string | null; os: string | null; logged_at: string }> = {};
  for (const a of analytics ?? []) {
    if (!analyticsMap[a.user_id]) analyticsMap[a.user_id] = a;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-heading">Player Ledger</h1>
          <p className="text-sm text-muted-foreground">{characters.length} characters</p>
        </div>
      </div>

      <form method="GET" className="flex gap-2">
        <input
          name="q"
          defaultValue={params.q}
          placeholder="Search by character name…"
          className="px-3 py-1.5 text-sm bg-card border border-border rounded-md text-body placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <button type="submit" className="px-3 py-1.5 text-sm bg-card border border-border rounded-md text-body hover:bg-accent transition-colors">
          Search
        </button>
      </form>

      <div className="bg-card border border-border rounded-lg overflow-x-auto">
        <table className="w-full text-sm whitespace-nowrap">
          <thead>
            <tr className="border-b border-border bg-accent/30">
              <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Character</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">User / Email</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Lvl</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Registered</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Last Login</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Total Played</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Last Session</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Country</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Device</th>
              <th className="px-4 py-2 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">Actions</th>
            </tr>
          </thead>
          <tbody>
            {characters.map((char, i) => {
              const user = userMap[char.user_id];
              const ana = analyticsMap[char.user_id];
              const totalPlay = playTimeMap[char.id] ?? 0;
              const lastSession = lastSessionMap[char.id];
              return (
                <tr key={char.id} className={`border-b border-border last:border-0 ${i % 2 === 0 ? '' : 'bg-accent/10'}`}>
                  <td className="px-4 py-2 font-medium text-heading">{char.name}</td>
                  <td className="px-4 py-2 text-xs text-muted-foreground max-w-[160px] truncate">{user?.email ?? '—'}</td>
                  <td className="px-4 py-2 font-mono text-body">{char.main_level}</td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">
                    {user?.created_at ? new Date(user.created_at).toLocaleDateString() : '—'}
                  </td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">
                    {timeAgo(user?.last_sign_in_at ?? null)}
                  </td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">
                    {totalPlay > 0 ? formatDuration(totalPlay) : '—'}
                  </td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">
                    {lastSession ? `${timeAgo(lastSession.date)}${lastSession.duration ? ` (${formatDuration(lastSession.duration)})` : ''}` : '—'}
                  </td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">{ana?.country ?? '—'}</td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">
                    {ana ? `${ana.device_type ?? ''} ${ana.browser ?? ''}`.trim() || '—' : '—'}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Link href={`/admin/players/${char.id}`} className="text-xs text-primary hover:underline">
                      View
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
