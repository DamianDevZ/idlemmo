import { requireAdmin } from '@/lib/admin-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import Link from 'next/link';
import { setAdminAccess } from '@/features/admin/admin-access-actions';

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

function TabBar({ active }: { active: 'players' | 'admins' }) {
  return (
    <div className="flex gap-1 border-b border-border">
      <Link
        href="/admin/players"
        className={`px-4 py-2 text-sm transition-colors ${
          active === 'players'
            ? 'font-semibold text-primary border-b-2 border-primary -mb-px'
            : 'text-muted-foreground hover:text-body'
        }`}
      >
        Players
      </Link>
      <Link
        href="/admin/players?tab=admins"
        className={`px-4 py-2 text-sm transition-colors ${
          active === 'admins'
            ? 'font-semibold text-primary border-b-2 border-primary -mb-px'
            : 'text-muted-foreground hover:text-body'
        }`}
      >
        Admin Access
      </Link>
    </div>
  );
}

export default async function AdminPlayersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; tab?: string }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const db = createAdminClient();
  const activeTab = params.tab === 'admins' ? 'admins' : 'players';

  // Fetch all auth users — needed by both tabs
  const { data: authUsersResult } = await db.auth.admin.listUsers();
  const allUsers = authUsersResult?.users ?? [];

  // ── Admin Access tab ─────────────────────────────────────────────────────
  if (activeTab === 'admins') {
    const admins    = allUsers.filter(u => u.app_metadata?.is_admin === true);
    const nonAdmins = allUsers.filter(u => u.app_metadata?.is_admin !== true);

    return (
      <div className="space-y-5">
        <h1 className="text-2xl font-bold text-heading">Player Ledger</h1>
        <TabBar active="admins" />

        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Current admins ({admins.length})
          </p>
          {admins.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">No admins yet.</p>
          ) : (
            <div className="bg-card border border-border rounded-lg overflow-hidden">
              {admins.map((u, i) => (
                <div
                  key={u.id}
                  className={`flex items-center justify-between px-4 py-3 ${i < admins.length - 1 ? 'border-b border-border' : ''}`}
                >
                  <div>
                    <p className="text-sm font-medium text-heading">{u.email}</p>
                    <p className="text-xs text-muted-foreground">
                      Last login:{' '}
                      {u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleDateString() : '—'}
                    </p>
                  </div>
                  <form action={async () => { 'use server'; await setAdminAccess(u.id, false); }}>
                    <button
                      type="submit"
                      className="text-xs px-3 py-1.5 rounded border border-destructive/40 text-destructive hover:bg-destructive/10 transition-colors"
                    >
                      Revoke
                    </button>
                  </form>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Grant access — all users ({nonAdmins.length})
          </p>
          {nonAdmins.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">All users already have admin access.</p>
          ) : (
            <div className="bg-card border border-border rounded-lg overflow-hidden">
              {nonAdmins.map((u, i) => (
                <div
                  key={u.id}
                  className={`flex items-center justify-between px-4 py-3 ${i < nonAdmins.length - 1 ? 'border-b border-border' : ''}`}
                >
                  <div>
                    <p className="text-sm text-body">{u.email}</p>
                    <p className="text-xs text-muted-foreground">
                      Registered:{' '}
                      {u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}
                    </p>
                  </div>
                  <form action={async () => { 'use server'; await setAdminAccess(u.id, true); }}>
                    <button
                      type="submit"
                      className="text-xs px-3 py-1.5 rounded border border-primary/40 text-primary hover:bg-primary/10 transition-colors"
                    >
                      Grant
                    </button>
                  </form>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Players tab ──────────────────────────────────────────────────────────
  let charQuery = db
    .from('characters')
    .select('id, name, main_level, main_xp, current_hp, created_at, updated_at, user_id')
    .order('created_at', { ascending: false });

  if (params.q) charQuery = charQuery.ilike('name', `%${params.q}%`);

  const { data: characters } = await charQuery;

  if (!characters?.length) {
    return (
      <div className="space-y-5">
        <h1 className="text-2xl font-bold text-heading">Player Ledger</h1>
        <TabBar active="players" />
        <p className="text-muted-foreground text-sm">No players found.</p>
      </div>
    );
  }

  const userMap = Object.fromEntries(
    allUsers.map(u => [
      u.id,
      { email: u.email, created_at: u.created_at, last_sign_in_at: u.last_sign_in_at },
    ])
  );

  const { data: sessionAgg } = await db
    .from('exploration_sessions')
    .select('character_id, started_at, ended_at')
    .in('character_id', characters.map(c => c.id));

  const playTimeMap: Record<string, number> = {};
  const lastSessionMap: Record<string, { date: string; duration: number | null }> = {};
  for (const s of sessionAgg ?? []) {
    const dur = s.ended_at
      ? (new Date(s.ended_at).getTime() - new Date(s.started_at).getTime()) / 1000
      : null;
    playTimeMap[s.character_id] = (playTimeMap[s.character_id] ?? 0) + (dur ?? 0);
    const prev = lastSessionMap[s.character_id];
    if (!prev || new Date(s.started_at) > new Date(prev.date)) {
      lastSessionMap[s.character_id] = { date: s.started_at, duration: dur };
    }
  }

  const userIds = [...new Set(characters.map(c => c.user_id))];
  const { data: analytics } = await db
    .from('player_analytics')
    .select('user_id, country, browser, device_type, os, logged_at')
    .in('user_id', userIds)
    .order('logged_at', { ascending: false });

  const analyticsMap: Record<string, { country?: string | null; browser?: string | null; device_type?: string | null }> = {};
  for (const a of analytics ?? []) {
    if (!analyticsMap[a.user_id]) analyticsMap[a.user_id] = a;
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-heading">Player Ledger</h1>
          <p className="text-sm text-muted-foreground">{characters.length} characters</p>
        </div>
      </div>

      <TabBar active="players" />

      <form method="GET" className="flex gap-2">
        <input
          name="q"
          defaultValue={params.q}
          placeholder="Search by character name…"
          className="px-3 py-1.5 text-sm bg-card border border-border rounded-md text-body placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <button
          type="submit"
          className="px-3 py-1.5 text-sm bg-card border border-border rounded-md text-body hover:bg-accent transition-colors"
        >
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
              const ana  = analyticsMap[char.user_id];
              const totalPlay  = playTimeMap[char.id] ?? 0;
              const lastSession = lastSessionMap[char.id];
              return (
                <tr
                  key={char.id}
                  className={`border-b border-border last:border-0 ${i % 2 === 0 ? '' : 'bg-accent/10'}`}
                >
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
                    {lastSession
                      ? `${timeAgo(lastSession.date)}${lastSession.duration ? ` (${formatDuration(lastSession.duration)})` : ''}`
                      : '—'}
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
