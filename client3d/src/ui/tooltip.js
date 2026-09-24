// Game-styled tooltips. Any element with a `title` (or `data-tip`) gets our own
// hover card instead of the browser's native one: the title attribute is moved
// to data-tip on first hover so the native tip never shows. First line renders
// as a heading; lines starting with ⚠ / ✓ are coloured.
import { el, fill } from "./dom.js";

let tip = null, timer = null, current = null;

function render(text) {
  const lines = String(text).split("\n").filter(Boolean);
  const [head, ...rest] = lines;
  const split = head.indexOf(": ");
  const title = split > 0 && split < 40 ? head.slice(0, split) : head;
  const lead = split > 0 && split < 40 ? head.slice(split + 2) : null;
  fill(tip,
    el("div", { class: "tt-h" }, title),
    lead ? el("div", { class: "tt-b" }, lead) : null,
    rest.map((l) => el("div", { class: `tt-l ${l.startsWith("⚠") ? "bad" : l.startsWith("✓") ? "good" : ""}` }, l)));
}

function place(e) {
  const r = tip.getBoundingClientRect();
  let x = e.clientX + 16, y = e.clientY - r.height - 12;
  if (y < 8) y = e.clientY + 20;
  if (x + r.width > window.innerWidth - 8) x = window.innerWidth - r.width - 8;
  tip.style.left = `${x}px`; tip.style.top = `${y}px`;
}

export function installTooltips() {
  tip = el("div", { class: "tt" });
  document.body.append(tip);
  document.addEventListener("mouseover", (e) => {
    const t = e.target.closest?.("[title], [data-tip]");
    if (!t || t === current) return;
    if (t.hasAttribute("title")) { t.dataset.tip = t.getAttribute("title"); t.removeAttribute("title"); }
    current = t;
    clearTimeout(timer);
    timer = setTimeout(() => { if (current === t && t.dataset.tip) { render(t.dataset.tip); tip.style.display = "block"; place(e); } }, 250);
  });
  document.addEventListener("mousemove", (e) => { if (tip.style.display === "block") place(e); });
  document.addEventListener("mouseout", (e) => {
    if (current && !current.contains(e.relatedTarget)) { current = null; clearTimeout(timer); tip.style.display = "none"; }
  });
  document.addEventListener("mousedown", () => { tip.style.display = "none"; });
}
