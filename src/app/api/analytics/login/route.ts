import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

function parseBrowser(ua: string): string {
  if (/Edg\//i.test(ua)) return 'Edge';
  if (/OPR\//i.test(ua) || /Opera/i.test(ua)) return 'Opera';
  if (/Chrome\//i.test(ua) && !/Chromium/i.test(ua)) return 'Chrome';
  if (/Firefox\//i.test(ua)) return 'Firefox';
  if (/Safari\//i.test(ua) && !/Chrome/i.test(ua)) return 'Safari';
  return 'Other';
}

function parseOS(ua: string): string {
  if (/Windows/i.test(ua)) return 'Windows';
  if (/Android/i.test(ua)) return 'Android';
  if (/iPhone|iPad/i.test(ua)) return 'iOS';
  if (/Mac OS X/i.test(ua)) return 'macOS';
  if (/Linux/i.test(ua)) return 'Linux';
  return 'Other';
}

function parseDevice(ua: string): string {
  if (/Mobile|Android.*Mobile|iPhone/i.test(ua)) return 'mobile';
  if (/iPad|Tablet|Android(?!.*Mobile)/i.test(ua)) return 'tablet';
  return 'desktop';
}

/**
 * Called by the client on first load after auth to record login analytics.
 * Reads Vercel/Cloudflare geo headers + User-Agent for device/browser/OS/country.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const ua = request.headers.get('user-agent') ?? '';
  const country =
    request.headers.get('x-vercel-ip-country') ??
    request.headers.get('cf-ipcountry') ??
    null;

  await supabase.from('player_analytics').insert({
    user_id: user.id,
    country,
    browser: parseBrowser(ua),
    device_type: parseDevice(ua),
    os: parseOS(ua),
  });

  return NextResponse.json({ ok: true });
}
