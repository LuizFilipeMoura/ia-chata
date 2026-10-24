// "Play log": a chassis's pilot audio diary on a reel. The tape clacks and
// hisses, then the pilot's voice reads it over the radio, one sentence at a
// time, while a typewriter transcript keeps pace.
import { el } from "./dom.js";
import { sfx } from "../audio.js";
import { logFor, sentences } from "../game/logs.js";

let playing = null; // { stop() } of the reel running now

const FONT = "'Courier New', Courier, monospace";

// A self-contained reel block for `chassisId` (button + transcript), or null
// if that chassis has no log.
export function reelPlayer(chassisId) {
  const log = logFor(chassisId);
  if (!log) return null;
  const text = el("div", { style: { fontFamily: FONT, fontSize: "13px", lineHeight: "1.45", whiteSpace: "pre-wrap", minHeight: "0", color: "#e8dcc0" } });
  const label = el("span", {}, "Play log");
  const btn = el("button", { class: "btn ghost", title: `${log.reel}: ${log.pilot}'s tape`, style: { fontSize: "13px", display: "inline-flex", gap: "6px", alignItems: "center" } }, el("span", { "aria-hidden": "true" }, "⏺"), label);
  const box = el("div", { class: "in-reel", style: { margin: "6px 0 8px", padding: "6px 8px", border: "1px solid rgba(232,220,192,0.2)", borderRadius: "4px", background: "rgba(20,16,10,0.55)" } },
    el("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" } },
      el("span", { style: { fontFamily: FONT, fontSize: "12px", opacity: "0.8" } }, `${log.reel} · ${log.title}`), btn),
    text);

  let token = 0;
  const stop = () => { token++; label.textContent = "Play log"; if (playing?.btn === btn) playing = null; };
  btn.addEventListener("click", () => {
    if (playing?.btn === btn) { stop(); return; }
    playing?.stop();
    const my = ++token;
    playing = { btn, stop };
    label.textContent = "Stop";
    text.textContent = `${log.pilot.toUpperCase()}, ${log.reel.toUpperCase()}\n`;
    sfx.tapeHiss();
    const lines = sentences(log.text);
    const alive = () => my === token && btn.isConnected;
    const say = (i) => {
      if (!alive()) return;
      if (i >= lines.length) { text.textContent += "\n[END OF REEL]"; stop(); return; }
      const line = lines[i];
      const secs = sfx.voice(line, log.voice) || line.length * 0.055;
      // Type the sentence out over the time it takes to say it.
      const start = text.textContent + (i ? " " : "");
      const t0 = performance.now(), ms = Math.max(400, secs * 1000);
      const type = () => {
        if (!alive()) return;
        const n = Math.min(line.length, Math.ceil(((performance.now() - t0) / ms) * line.length));
        text.textContent = start + line.slice(0, n);
        if (n < line.length) requestAnimationFrame(type);
      };
      type();
      setTimeout(() => say(i + 1), ms + 450);
    };
    setTimeout(() => say(0), 1100);
  });
  return box;
}
