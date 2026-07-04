import { setStatus } from "./status.js";

const micBtn = document.getElementById("micBtn");
const langSelect = document.getElementById("langSelect");
const ttsToggle = document.getElementById("ttsToggle");

let ttsEnabled = false;

export function isTtsEnabled() { return ttsEnabled; }

// --- Speech-to-text ---
// Wire the mic to the recognizer; each final transcript is handed to
// `onTranscript` (the chat sender) so speech.js stays independent of chat.js.
export function initSpeech({ onTranscript }) {
  const SpeechRecognitionImpl = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognition = null;
  let recognizing = false;

  if (SpeechRecognitionImpl) {
    recognition = new SpeechRecognitionImpl();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      recognizing = true;
      micBtn.classList.add("recording");
      setStatus("Listening…");
    };

    recognition.onend = () => {
      recognizing = false;
      micBtn.classList.remove("recording");
      setStatus("");
    };

    recognition.onerror = (event) => {
      recognizing = false;
      micBtn.classList.remove("recording");
      setStatus(`Mic error: ${event.error}`);
    };

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      onTranscript(transcript);
    };

    micBtn.addEventListener("click", () => {
      if (recognizing) {
        recognition.stop();
        return;
      }
      recognition.lang = langSelect.value;
      try {
        recognition.start();
      } catch {
        // ignore duplicate start calls
      }
    });
  } else {
    micBtn.disabled = true;
    micBtn.title = "Speech recognition not supported in this browser";
  }
}

// --- Text-to-speech ---
ttsToggle.addEventListener("click", () => {
  ttsEnabled = !ttsEnabled;
  ttsToggle.classList.toggle("active", ttsEnabled);
  ttsToggle.setAttribute("aria-pressed", String(ttsEnabled));
  if (!ttsEnabled) window.speechSynthesis.cancel();
});

export function speak(text) {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "pt-BR";
  const voices = window.speechSynthesis.getVoices();
  const ptVoice = voices.find((v) => v.lang === "pt-BR") || voices.find((v) => v.lang?.startsWith("pt"));
  if (ptVoice) utterance.voice = ptVoice;
  window.speechSynthesis.speak(utterance);
}
