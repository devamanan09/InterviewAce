import type { TranscriptItem } from '@/lib/types';
import { ChatMessage } from './chat-message';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useEffect, useRef } from 'react';

interface ChatLogProps {
  messages: TranscriptItem[];
  height?: string;
}

export function ChatLog({ messages, height = "300px" }: ChatLogProps) {
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollAreaRef.current) {
      const viewport = scrollAreaRef.current.querySelector('div[data-radix-scroll-area-viewport]');
      if (viewport) {
        viewport.scrollTop = viewport.scrollHeight;
      }
    }
  }, [messages]);


  return (
    <ScrollArea ref={scrollAreaRef} className="w-full rounded-md border bg-card shadow" style={{ height }}>
      <div className="p-4 space-y-4">
        {messages.length === 0 && (
          <p className="text-center text-muted-foreground">Conversation will appear here.</p>
        )}
        {messages.map((msg, index) => (
          <ChatMessage key={index} message={msg} />
        ))}
      </div>
    </ScrollArea>
  );
}
