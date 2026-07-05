import { useCallback, useState } from "react";
import { Topbar } from "./Topbar";
import { Stage } from "./Stage";
import { OutcomeBanner } from "./OutcomeBanner";
import { TurnBanner } from "./TurnBanner";
import { ChatProvider } from "./chat/ChatContext";
import { ChatFab } from "./chat/ChatFab";
import { ChatPanel } from "./chat/ChatPanel";
import { GlossaryDialog } from "./overlays/GlossaryDialog";
import { useUi } from "../state/UiStateContext";
import { useBattleWatchers } from "../hooks/useBattleWatchers";

function ChatMount() {
  const { chatOpen, setChatOpen } = useUi();
  const [hasUnread, setHasUnread] = useState(false);

  const flagUnread = useCallback(() => setHasUnread(true), []);
  const toggleChat = useCallback(() => {
    if (!chatOpen) setHasUnread(false);
    setChatOpen(!chatOpen);
  }, [chatOpen, setChatOpen]);

  return (
    <ChatProvider>
      <ChatFab hasUnread={hasUnread} onClick={toggleChat} />
      <ChatPanel onBotMessage={flagUnread} />
    </ChatProvider>
  );
}

export function Terminal() {
  useBattleWatchers();
  const { glossaryOpen, setGlossaryOpen } = useUi();
  return (
    <>
      <TurnBanner />
      <div className="term">
        <Topbar />
        <Stage />
        <OutcomeBanner />
        <GlossaryDialog open={glossaryOpen} onClose={() => setGlossaryOpen(false)} />
        <ChatMount />
      </div>
    </>
  );
}
