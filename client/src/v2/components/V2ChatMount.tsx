import { useCallback, useEffect, useState } from "react";
import { ChatProvider } from "../../components/chat/ChatContext";
import { ChatPanel } from "../../components/chat/ChatPanel";
import { useUi } from "../../state/UiStateContext";

export function V2ChatMount({ onUnreadChange }: { onUnreadChange?: (v: boolean) => void }) {
  const { chatOpen } = useUi();
  const [hasUnread, setHasUnread] = useState(false);
  useEffect(() => { onUnreadChange?.(hasUnread); }, [hasUnread, onUnreadChange]);
  useEffect(() => { if (chatOpen) setHasUnread(false); }, [chatOpen]);
  const flagUnread = useCallback(() => setHasUnread(true), []);
  return (
    <ChatProvider>
      <ChatPanel onBotMessage={flagUnread} />
    </ChatProvider>
  );
}
