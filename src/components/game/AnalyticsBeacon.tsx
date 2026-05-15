'use client';

import { useEffect } from 'react';

/** Fires POST /api/analytics/login once per browser session to record country/device/browser. */
export function AnalyticsBeacon() {
  useEffect(() => {
    if (sessionStorage.getItem('analytics_sent')) return;
    fetch('/api/analytics/login', { method: 'POST' })
      .then(() => sessionStorage.setItem('analytics_sent', '1'))
      .catch(() => {}); // non-critical, fail silently
  }, []);
  return null;
}
