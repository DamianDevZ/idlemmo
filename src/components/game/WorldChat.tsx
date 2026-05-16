'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

export type ChatMessage = {
  id: string;
  character_id: string;
  character_name: string;
  message: string;
  created_at: string;
};

const COOLDOWN_MS = 3_000;
const MAX_LENGTH = 200;

export function WorldChat({
  characterId,
  characterName,
  initialMessages,
}: {
  characterId: string;
  characterName: string;
  initialMessages: ChatMessage[];
}) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [lastSentAt, setLastSentAt] = useState(0);
  const [cooldownLeft, setCooldownLeft] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Shared refs so both the realtime/poll effect and handleSend
  // can deduplicate and track the latest timestamp without conflicts.
  const knownIds = useRef(new Set(initialMessages.map((m) => m.id)));
  const latestAt = useRef(
    initialMessages.length > 0
      ? initialMessages[initialMessages.length - 1].created_at
      : new Date(0).toISOString(),
  );

  // Auto-scroll anchor to bottom whenever messages change
  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Stable helper — refs mean this never needs to be recreated
  const addMessage = useCallback((msg: ChatMessage) => {
    if (knownIds.current.has(msg.id)) return;
    knownIds.current.add(msg.id);
    if (msg.created_at > latestAt.current) latestAt.current = msg.created_at;
    setMessages((prev) => {
      const next = [...prev, msg];
      return next.length > 50 ? next.slice(next.length - 50) : next;
    });
  }, []);

  // Realtime subscription + 5 s polling fallback.
  // Unique channel name per mount avoids React StrictMode double-subscribe conflicts.
  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`world-chat-${Math.random().toString(36).slice(2, 9)}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'world_chat_messages' },
        (payload) => addMessage(payload.new as ChatMessage),
      )
      .subscribe();

    const poll = setInterval(async () => {
      const { data } = await supabase
        .from('world_chat_messages')
        .select('id, character_id, character_name, message, created_at')
        .gt('created_at', latestAt.current)
        .order('created_at', { ascending: true })
        .limit(20);
      (data ?? []).forEach((row) => addMessage(row as ChatMessage));
    }, 5_000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(poll);
    };
  }, [addMessage]);

  // Cooldown countdown on the Send button
  useEffect(() => {
    if (cooldownLeft <= 0) return;
    const timer = setInterval(() => {
      const remaining = COOLDOWN_MS - (Date.now() - lastSentAt);
      setCooldownLeft(remaining <= 0 ? 0 : remaining);
    }, 100);
    return () => clearInterval(timer);
  }, [lastSentAt, cooldownLeft]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || sending || cooldownLeft > 0) return;

    setSending(true);
    const supabase = createClient();
    // Request the inserted row back so we can show it optimistically
    // using the real DB id — dedup prevents realtime/poll from doubling it.
    const { data, error } = await supabase
      .from('world_chat_messages')
      .insert({ character_id: characterId, character_name: characterName, message: text })
      .select('id, character_id, character_name, message, created_at')
      .single();
    setSending(false);

    if (!error && data) {
      addMessage(data as ChatMessage); // appears immediately, not after cooldown
      setInput('');
      const now = Date.now();
      setLastSentAt(now);
      setCooldownLeft(COOLDOWN_MS);
    }
  }, [input, sending, cooldownLeft, characterId, characterName, addMessage]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-[420px] rounded-lg border border-border bg-card overflow-hidden">
      {/* Message list.
          A flex-1 spacer div above the messages anchors them to the bottom
          so the chat always looks "full" and new messages push old ones up. */}
      <div className="flex-1 overflow-y-auto flex flex-col p-3">
        <div className="flex-1" />
        <div className="space-y-3">
          {messages.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">
              No messages yet. Be the first to say hello! 👋
            </p>
          ) : (
            messages.map((msg) => (
              <div key={msg.id}>
                <div className="flex items-baseline gap-1.5">
                  <span
                    className={
                      msg.character_id === characterId
                        ? 'text-sm font-bold text-primary'
                        : 'text-sm font-semibold text-heading'
                    }
                  >
                    {msg.character_name}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {new Date(msg.created_at).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
                <p className="text-sm text-body leading-snug">{msg.message}</p>
              </div>
            ))
          )}
          {/* Scroll anchor */}
          <div ref={scrollRef} />
        </div>
      </div>

      {/* Input area — always fixed height, char counter reserves space even when empty */}
      <div className="border-t border-border bg-card px-3 pt-2 pb-2">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value.slice(0, MAX_LENGTH))}
            onKeyDown={handleKeyDown}
            placeholder="Say something to the world…"
            disabled={sending}
            className="flex-1 text-sm px-3 py-1.5 rounded-md border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary text-foreground placeholder:text-muted-foreground disabled:opacity-50"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || sending || cooldownLeft > 0}
            className="px-4 py-1.5 rounded-md text-sm font-semibold bg-primary text-primary-foreground disabled:opacity-40 hover:opacity-90 transition-opacity tabular-nums min-w-[64px]"
          >
            {cooldownLeft > 0 ? `${(cooldownLeft / 1000).toFixed(1)}s` : 'Send'}
          </button>
        </div>
        {/* Always reserve the same height — avoids layout shift when typing */}
        <p className="text-right text-[10px] text-muted-foreground mt-1 h-3 leading-none">
          {input.length > 0 ? `${input.length} / ${MAX_LENGTH}` : ''}
        </p>
      </div>
    </div>
  );
}
