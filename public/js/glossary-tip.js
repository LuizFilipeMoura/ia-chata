import { GLOSSARY } from "/shared/glossary.js";

const byId = new Map(GLOSSARY.map((e) => [e.id, e]));

const tip = document.getElementById("glossaryTip");
const tipTerm = tip.querySelector(".glossary-tip-term");
const tipDef = tip.querySelector(".glossary-tip-def");
const tipClose = tip.querySelector(".glossary-tip-close");

let anchor = null;
let hideTimer = null;

function place() {
  if (!anchor) return;
  const r = anchor.getBoundingClientRect();
  const margin = 10;
  const tw = tip.offsetWidth;
  const th = tip.offsetHeight;

  let left = r.left + r.width / 2 - tw / 2;
  left = Math.max(margin, Math.min(left, window.innerWidth - tw - margin));

  const fitsAbove = r.top - th - 12 >= margin;
  const top = fitsAbove ? r.top - th - 12 : r.bottom + 12;

  tip.style.left = `${left}px`;
  tip.style.top = `${top}px`;
  tip.classList.toggle("tip-below", !fitsAbove);
  // Point the arrow at the anchor's centre even when the tip is clamped sideways.
  const arrowX = Math.max(14, Math.min(r.left + r.width / 2 - left, tw - 14));
  tip.style.setProperty("--arrow-x", `${arrowX}px`);
}

function openFor(el) {
  const entry = byId.get(el.dataset.term);
  if (!entry) return;
  clearTimeout(hideTimer);
  anchor?.classList.remove("is-open");
  anchor = el;
  anchor.classList.add("is-open");
  tipTerm.textContent = entry.term;
  tipDef.textContent = entry.def;
  tip.hidden = false;
  void tip.offsetWidth; // commit hidden->visible before animating in
  place();
  tip.classList.add("show");
}

function close() {
  tip.classList.remove("show");
  anchor?.classList.remove("is-open");
  anchor = null;
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => {
    if (!tip.classList.contains("show")) tip.hidden = true;
  }, 160);
}

document.addEventListener("click", (e) => {
  const term = e.target.closest(".glossary-term");
  if (term) {
    e.stopPropagation();
    if (anchor === term) { close(); return; }
    openFor(term);
    return;
  }
  if (!tip.hidden && !tip.contains(e.target)) close();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !tip.hidden) { close(); return; }
  if ((e.key === "Enter" || e.key === " ") && e.target?.classList?.contains("glossary-term")) {
    e.preventDefault();
    if (anchor === e.target) close(); else openFor(e.target);
  }
});

tipClose.addEventListener("click", close);
window.addEventListener("resize", () => { if (!tip.hidden) place(); });
// Any scroll (message log, stage) invalidates the anchor's position — just close.
document.addEventListener("scroll", () => { if (!tip.hidden) close(); }, true);
