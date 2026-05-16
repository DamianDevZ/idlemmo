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

  // Auto-scroll to the newest message whenever the list changes
  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Supabase Realtime subscription — listen for new inserts.
  // A unique channel name per mount avoids conflicts when React StrictMode
  // unmounts and remounts the component during development.
  useEffect(() => {
    const supabase = createClient();

    // Track known IDs so both realtime and poll paths can deduplicate safely
    const knownIds = new Set(initialMessages.map((m) => m.id));
    let latestAt =
      initialMessages.length > 0
        ? initialMessages[initialMessages.length - 1].created_at
        : new Date(0).toISOString();

    const addMessage = (msg: ChatMessage) => {
      if (knownIds.has(msg.id)) return;
      knownIds.add(msg.id);
      if (msg.created_at > latestAt) latestAt = msg.created_at;
      setMessages((prev) => {
        const next = [...prev, msg];
        return next.length > 50 ? next.slice(next.length - 50) : next;
      });
    };

    // Realtime: postgres_changes on world_chat_messages
    const channel = supabase
      .channel(`world-chat-${Math.random().toString(36).slice(2, 9)}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'world_chat_messages' },
        (payload) => addMessage(payload.new as ChatMessage),
      )
      .subscribe();

    // Polling fallback every 5 s — catches messages if the WebSocket is not
    // delivering (e.g. Realtime disabled on the project or network issues)
    const poll = setInterval(async () => {
      const { data } = await supabase
        .from('world_chat_messages')
        .select('id, character_id, character_name, message, created_at')
        .gt('created_at', latestAt)
        .order('created_at', { ascending: true })
        .limit(20);
      (data ?? []).forEach((row) => addMessage(row as ChatMessage));
    }, 5_000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(poll);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Cooldown countdown displayed on the Send button
  useEffect(() => {
    if (cooldownLeft <= 0) return;
    const timer = setInterval(() => {
      const remaining = COOLDOWN_MS - (Date.now() - lastSentAt);
      if (remaining <= 0) {
        setCooldownLeft(0);
      } else {
        setCooldownLeft(remaining);
      }
    }, 100);
    return () => clearInterval(timer);
  }, [lastSentAt, cooldownLeft]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || sending || cooldownLeft > 0) return;

    setSending(true);
    const supabase = createClient();
    const { error } = await supabase
      .from('world_chat_messages')
      .insert({ character_id: characterId, character_name: characterName, message: text });
    setSending(false);

    if (!error) {
      setInput('');
      const now = Date.now();
      setLastSentAt(now);
      setCooldownLeft(COOLDOWN_MS);
    }
  }, [input, sending, cooldownLeft, characterId, characterName]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-[420px] rounded-lg border border-border bg-card overflow-hidden">
      {/* Message list */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-12">
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
        {/* Invisible anchor — scrolled into view on new messages */}
        <div ref={scrollRef} />
      </div>

      {/* Input row */}
      <div className="border-t border-border bg-card px-3 py-2 space-y-1">
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
        {input.length > 0 && (
          <p className="text-right text-[10px] text-muted-foreground">
            {input.length} / {MAX_LENGTH}
          </p>
        )}
      </div>
    </div>
  );
}
