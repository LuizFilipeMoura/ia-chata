import { S } from "./state.js";
import { setStatus } from "./status.js";
import { applyRigCommands, stripRigTags } from "./rig-tags.js";
import { renderMarkdown } from "./markdown.js";
import { speak, isTtsEnabled } from "./speech.js";

const messagesEl = document.getElementById("messages");
const textInput = document.getElementById("textInput");
const sendBtn = document.getElementById("sendBtn");
const thinkToggle = document.getElementById("thinkToggle");
const clearBtn = document.getElementById("clearBtn");

let history = [];
let thinkEnabled = true;
let isStreaming = false;

export function addBubble(role, text) {
  const div = document.createElement("div");
  div.className = `bubble ${role === "user" ? "user" : "bot"}`;
  div.textContent = text;
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return div;
}

function autoResize() {
  textInput.style.height = "auto";
  textInput.style.height = Math.min(textInput.scrollHeight, 120) + "px";
}
textInput.addEventListener("input", autoResize);

function addBotResponseBubble() {
  const bubble = document.createElement("div");
  bubble.className = "bubble bot pending";

  const thinkBlock = document.createElement("details");
  thinkBlock.className = "think-block";
  thinkBlock.style.display = "none";
  thinkBlock.open = true;
  const summary = document.createElement("summary");
  summary.textContent = "Reasoning";
  const thinkText = document.createElement("div");
  thinkText.className = "think-text";
  thinkBlock.appendChild(summary);
  thinkBlock.appendChild(thinkText);

  const answerText = document.createElement("div");
  answerText.className = "answer-text";

  bubble.appendChild(thinkBlock);
  bubble.appendChild(answerText);
  messagesEl.appendChild(bubble);
  messagesEl.scrollTop = messagesEl.scrollHeight;

  return { bubble, thinkBlock, thinkText, answerText };
}

export async function sendMessage(text) {
  const trimmed = text.trim();
  if (!trimmed || isStreaming) return;

  addBubble("user", trimmed);
  history.push({ role: "user", content: trimmed });
  textInput.value = "";
  autoResize();

  const { bubble, thinkBlock, thinkText, answerText } = addBotResponseBubble();
  isStreaming = true;
  sendBtn.disabled = true;
  setStatus(thinkEnabled ? "Reasoning…" : "Thinking…");

  let answer = "";
  let thinking = "";

  try {
    const resp = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: history, think: thinkEnabled, room: S.session?.room, side: S.session?.side }),
    });

    if (!resp.ok || !resp.body) {
      throw new Error(`Server responded ${resp.status}`);
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";

      for (const line of lines) {
        const t = line.trim();
        if (!t) continue;

        let evt;
        try {
          evt = JSON.parse(t);
        } catch {
          continue;
        }

        if (evt.type === "thinking") {
          thinking += evt.text;
          thinkBlock.style.display = "";
          thinkText.textContent = thinking;
        } else if (evt.type === "content") {
          if (!answer) {
            thinkBlock.open = false;
            setStatus("Answering…");
          }
          answer += evt.text;
          renderMarkdown(answerText, stripRigTags(answer));
        }
        messagesEl.scrollTop = messagesEl.scrollHeight;
      }
    }
  } catch (err) {
    renderMarkdown(answerText, `${stripRigTags(answer)}\n\n[Error: ${err.message}]`);
    setStatus("Error contacting the server.");
  } finally {
    bubble.classList.remove("pending");
    isStreaming = false;
    sendBtn.disabled = false;
    setStatus("");
  }

  if (answer) {
    applyRigCommands(answer);
    const spoken = stripRigTags(answer);
    renderMarkdown(answerText, spoken);
    history.push({ role: "assistant", content: spoken });
    if (isTtsEnabled()) speak(spoken);
  }
}

sendBtn.addEventListener("click", () => sendMessage(textInput.value));
textInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage(textInput.value);
  }
});

// --- Clear conversation context (keeps tracked Rigs) ---
clearBtn.addEventListener("click", () => {
  if (isStreaming) return;
  if (window.speechSynthesis) window.speechSynthesis.cancel();
  history = [];
  messagesEl.innerHTML = "";
  addBubble("bot", "Context cleared — your tracked Rigs are kept. Narrate the battle or ask a rules question.");
  setStatus("Context cleared.");
  setTimeout(() => setStatus(""), 2000);
});

// --- Reasoning toggle ---
thinkToggle.addEventListener("click", () => {
  thinkEnabled = !thinkEnabled;
  thinkToggle.classList.toggle("active", thinkEnabled);
  thinkToggle.setAttribute("aria-pressed", String(thinkEnabled));
});
