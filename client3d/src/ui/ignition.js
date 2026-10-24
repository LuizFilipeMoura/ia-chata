// Engine start-up ritual at battle start: a brass control panel where the
// ignition switches flip, the boiler gauges sweep to the stop and settle, and
// the ENGINES LIVE lamp lights; then it fades off the table. About 2.5s, any
// click or key skips it. Reduced motion: the panel shows already lit, briefly.
import { el } from "./dom.js";
import { boilerGauge } from "./gauge.js";
import { sfx } from "../audio.js";

const SWITCHES = ["MAGNETO", "FUEL", "BOILER", "SERVOS"];
const RUN_MS = 2500, STILL_MS = 900, FADE_MS = 450;

export function engineStart({ parent = document.body, onDone } = {}) {
  if (document.querySelector(".ignition")) return null;
  const reduced = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  sfx.engineStart?.();
  const ov = el("div", { class: `ignition${reduced ? " still" : ""}` },
    el("div", { class: "ig-panel deco-frame" },
      el("div", { class: "ig-sun sunburst" }),
      el("div", { class: "ig-title" }, "Engine start"),
      el("div", { class: "deco-rule" }),
      el("div", { class: "ig-switches" }, SWITCHES.map((label, i) =>
        el("div", { class: "ig-sw", style: `--d:${120 + i * 150}ms` }, el("span", { class: "ig-toggle" }, el("i")), el("small", {}, label)))),
      el("div", { class: "ig-gauges" }, [[4, 6, "PRESSURE"], [3, 5, "OIL"], [5, 7, "STEAM"]].map(([h, cap, label], i) =>
        el("div", { class: "ig-g", style: `--d:${750 + i * 140}ms` }, boilerGauge(h, cap, { size: "md", sweep: true, title: label }), el("small", {}, label)))),
      el("div", { class: "ig-lamp" }, el("i"), el("b", {}, "Engines live")),
      el("div", { class: "ig-skip" }, "Click to skip")));
  let gone = false;
  const done = () => {
    if (gone) return;
    gone = true;
    clearTimeout(timer);
    window.removeEventListener("keydown", done, true);
    ov.classList.add("out");
    setTimeout(() => ov.remove(), reduced ? 0 : FADE_MS);
    onDone?.();
  };
  const timer = setTimeout(done, reduced ? STILL_MS : RUN_MS);
  ov.addEventListener("pointerdown", done);
  window.addEventListener("keydown", done, true);
  parent.append(ov);
  return ov;
}
