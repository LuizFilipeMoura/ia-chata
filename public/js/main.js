import { S, onServerStateChange } from "./state.js";
import { renderRigs } from "./tracker.js";
import { renderBattle } from "./battle.js";
import { initSpeech } from "./speech.js";
import { sendMessage, addBubble } from "./chat.js";
import { joinRoomFlow, showGate } from "./join.js";

// Re-render the tracker whenever the client adopts new server state.
onServerStateChange(() => { renderRigs(); renderBattle(); });

// Voice transcripts are sent as chat messages.
initSpeech({ onTranscript: sendMessage });

// ===== Keyboard-safe viewport height =====
// Track the visual viewport so the dock (and its controls) always sits above
// the on-screen keyboard instead of being pushed off the top of the screen.
const vv = window.visualViewport;
function syncViewport() {
  if (!vv) return;
  const h = vv.height;
  if (!h || h < 1) return; // ignore transient/bogus 0 readings that would collapse the shell
  document.documentElement.style.setProperty("--app-h", h + "px");
}
if (vv) {
  vv.addEventListener("resize", syncViewport);
  vv.addEventListener("scroll", syncViewport);
  syncViewport();
}

addBubble("bot", "Ask me anything about the Of Oil and Iron rulebook — by text or by tapping the mic. Tap 🛠 Rigs to see your squadron and the enemy's.");

if (S.session?.room) {
  joinRoomFlow(S.session.room, S.session.name, S.session.side)
    .catch(() => { showGate(); });
} else {
  showGate();
}
