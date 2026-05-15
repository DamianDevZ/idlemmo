'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { sendFriendRequest } from '@/features/town/actions';

export function AddFriendForm() {
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState('');
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus(null);
    startTransition(async () => {
      try {
        await sendFriendRequest(name);
        setStatus({ ok: true, msg: 'Friend request sent!' });
        setName('');
      } catch (err) {
        setStatus({ ok: false, msg: err instanceof Error ? err.message : 'Something went wrong' });
      }
    });
  }

  return (
    <form onSubmit={submit} className="flex gap-2">
      <Input
        placeholder="Character name…"
        value={name}
        onChange={e => setName(e.target.value)}
        disabled={pending}
        className="h-9 text-sm flex-1"
      />
      <Button type="submit" size="sm" className="h-9 shrink-0" disabled={pending || !name.trim()}>
        Add
      </Button>
      {status && (
        <p className={`text-xs self-center ${status.ok ? 'text-green-400' : 'text-red-400'}`}>
          {status.msg}
        </p>
      )}
    </form>
  );
}
