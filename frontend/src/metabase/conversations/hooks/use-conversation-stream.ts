import { useEffect, useState } from "react";

import { type ConversationStreamEvent, type ConversationView, applyEvent } from "shared/conversation";

export interface ConversationStream {
  view: ConversationView | null;
  isConnected: boolean;
}

export function useConversationStream(conversationId: string | null): ConversationStream {
  const [view, setView] = useState<ConversationView | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    setView(null);
    setIsConnected(false);
    if (!conversationId) {
      return;
    }
    const source = new EventSource(`/api/conversation/${encodeURIComponent(conversationId)}/events`);
    source.onopen = () => setIsConnected(true);
    source.onerror = () => setIsConnected(false);
    source.onmessage = (message) => {
      const data = JSON.parse(message.data) as ConversationStreamEvent;
      if (data.kind === "snapshot") {
        setView(data.view);
      } else {
        setView((current) => (current ? applyEvent(current, data.event) : current));
      }
    };
    return () => source.close();
  }, [conversationId]);

  return { view, isConnected };
}
