'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { acceptFriendRequest, declineFriendRequest } from '@/features/town/actions';

interface Props {
  requestId: string;
  fromName: string;
}

export function FriendRequestCard({ requestId, fromName }: Props) {
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handle(action: 'accept' | 'decline') {
    setError(null);
    setPending(true);
    try {
      const result = action === 'accept'
        ? await acceptFriendRequest(requestId)
        : await declineFriendRequest(requestId);
      if (result?.error) {
        setError(result.error);
      } else {
        setDone(true);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setPending(false);
    }
  }

  if (done) return null;

  return (
    <div className="flex items-center justify-between px-4 py-3 rounded-lg border border-primary/30 bg-primary/5">
      <span className="text-sm font-medium">{fromName}</span>
      <div className="flex items-center gap-2">
        {error && <span className="text-xs text-red-400">{error}</span>}
        <Button
          size="sm"
          variant="outline"
          className="h-8 text-xs"
          disabled={pending}
          onClick={() => handle('decline')}
        >
          Decline
        </Button>
        <Button
          size="sm"
          className="h-8 text-xs"
          disabled={pending}
          onClick={() => handle('accept')}
        >
          Accept
        </Button>
      </div>
    </div>
  );
}
