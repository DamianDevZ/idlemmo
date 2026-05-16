'use client';

import { useState, useEffect } from 'react';
import { Tabs } from '@/components/ui/tabs';

/**
 * Drop-in replacement for <Tabs defaultValue="..."> that remembers the active
 * tab across page refreshes using localStorage. The initial render uses
 * `defaultValue` (matching server HTML), then swaps to the saved value after
 * hydration — no hydration mismatch.
 */
export function PersistentTabs({
  storageKey,
  defaultValue,
  children,
  className,
}: {
  /** Unique key scoped to this set of tabs, e.g. "town" or "home". */
  storageKey: string;
  defaultValue: string;
  children: React.ReactNode;
  className?: string;
}) {
  const [value, setValue] = useState(defaultValue);

  // After hydration, restore the last-used tab from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(`tab:${storageKey}`);
      if (saved) setValue(saved);
    } catch {
      // localStorage may be unavailable in some environments — silent fallback
    }
  }, [storageKey]);

  const handleValueChange = (newValue: string) => {
    setValue(newValue);
    try {
      localStorage.setItem(`tab:${storageKey}`, newValue);
    } catch {
      // Ignore write errors
    }
  };

  return (
    <Tabs value={value} onValueChange={handleValueChange} className={className}>
      {children}
    </Tabs>
  );
}
