import { cn } from "@/lib/utils";
import type { TranscriptItem } from "@/lib/types";
import { User, Bot, Mic } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface ChatMessageProps {
  message: TranscriptItem;
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.speaker === 'user';
  const isAI = message.speaker === 'ai';
  const isInterviewer = message.speaker === 'interviewer';

  const Icon = isUser ? User : isAI ? Bot : Mic;
  const alignment = isUser ? 'items-end' : 'items-start';
  const bubbleColor = isUser ? 'bg-primary text-primary-foreground' : isAI ? 'bg-accent text-accent-foreground' : 'bg-secondary text-secondary-foreground';
  const initials = message.speaker.substring(0, 1).toUpperCase();

  return (
    <div className={cn("flex flex-col w-full my-2", alignment)}>
      <div className={cn("flex items-end space-x-2 max-w-[75%]", isUser ? "flex-row-reverse space-x-reverse" : "flex-row")}>
        <Avatar className="h-8 w-8 shrink-0">
           {/* <AvatarImage src={isUser ? "/path/to/user-avatar.png" : "/path/to/other-avatar.png"} /> */}
          <AvatarFallback className={cn(bubbleColor, "text-sm")}>
            <Icon className="w-4 h-4" />
          </AvatarFallback>
        </Avatar>
        <div
          className={cn(
            "px-4 py-2 rounded-lg shadow-md",
            bubbleColor,
            isUser ? "rounded-br-none" : "rounded-bl-none"
          )}
        >
          <p className="text-sm whitespace-pre-wrap">{message.text}</p>
        </div>
      </div>
       <p className={cn("text-xs text-muted-foreground mt-1", isUser ? "text-right" : "text-left")}>
          {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </p>
    </div>
  );
}
