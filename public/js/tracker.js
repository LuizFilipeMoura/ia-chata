import { S, LOCS, findRig } from "./state.js";
import { sendCommand } from "./api.js";
import { setStatus } from "./status.js";

const rigList = document.getElementById("rigList");
const rigNameInput = document.getElementById("rigName");
const rigClassSelect = document.getElementById("rigClass");
const rigAddBtn = document.getElementById("rigAddBtn");
const rigAddScreen = document.getElementById("rigAddScreen");
const rigDeckTitle = document.getElementById("rigDeckTitle");
const rigDots = document.getElementById("rigDots");
const rigPrev = document.getElementById("rigPrev");
const rigNext = document.getElementById("rigNext");
const rigPanel = document.getElementById("rigPanel");
const rigToggle = document.getElementById("rigToggle");
const rigClose = document.getElementById("rigClose");
const sheetScrim = document.getElementById("sheetScrim");

function barClass(c) {
  if (c.destroyed) return "rig-fill-dead";
  if (c.sp === 0) return "rig-fill-crit";
  const ratio = c.sp / c.max;
  if (ratio <= 0.34) return "rig-fill-low";
  if (ratio <= 0.67) return "rig-fill-warn";
  return "rig-fill-ok";
}

function compRow(rig, loc) {
  const c = rig[loc];
  const row = document.createElement("div");
  row.className = "rig-comp";

  const label = document.createElement("span");
  label.className = "rig-comp-label";
  label.textContent = loc.charAt(0).toUpperCase() + loc.slice(1);

  const minus = document.createElement("button");
  minus.className = "rig-step";
  minus.type = "button";
  minus.textContent = "−";
  minus.setAttribute("aria-label", `Damage ${loc}`);
  minus.addEventListener("click", () => sendCommand("damage", { name: rig.name, loc, amount: "1" }));

  const bar = document.createElement("div");
  bar.className = "rig-bar";
  const fill = document.createElement("div");
  fill.className = "rig-bar-fill " + barClass(c);
  fill.style.width = Math.round((c.sp / c.max) * 100) + "%";
  const txt = document.createElement("div");
  txt.className = "rig-bar-text";
  txt.textContent = c.destroyed ? "DESTROYED" : (c.sp === 0 ? "CATASTROPHIC" : `${c.sp}/${c.max}`);
  bar.appendChild(fill);
  bar.appendChild(txt);

  const plus = document.createElement("button");
  plus.className = "rig-step";
  plus.type = "button";
  plus.textContent = "＋";
  plus.setAttribute("aria-label", `Repair ${loc}`);
  plus.addEventListener("click", () => sendCommand("repair", { name: rig.name, loc, amount: "1" }));

  row.appendChild(label);
  row.appendChild(minus);
  row.appendChild(bar);
  row.appendChild(plus);

  if (loc === "engine") {
    const hMinus = document.createElement("button");
    hMinus.className = "rig-step";
    hMinus.type = "button";
    hMinus.textContent = "🔥−";
    hMinus.style.fontSize = "0.6rem";
    hMinus.setAttribute("aria-label", "Decrease heat");
    hMinus.addEventListener("click", () => sendCommand("heat", { name: rig.name, amount: "-1" }));

    const heat = document.createElement("span");
    heat.className = "rig-heat-val";
    heat.textContent = "🔥" + c.heat;

    const hPlus = document.createElement("button");
    hPlus.className = "rig-step";
    hPlus.type = "button";
    hPlus.textContent = "🔥＋";
    hPlus.style.fontSize = "0.6rem";
    hPlus.setAttribute("aria-label", "Increase heat");
    hPlus.addEventListener("click", () => sendCommand("heat", { name: rig.name, amount: "+1" }));

    row.appendChild(hMinus);
    row.appendChild(heat);
    row.appendChild(hPlus);
  }

  return row;
}

// Overall condition summary shown at the top of a rig's terminal screen.
function rigStatus(rig) {
  if (rig.destroyed) return { text: "⛔ System failure — destroyed", cls: "crit" };
  if (LOCS.some((l) => rig[l].sp === 0)) return { text: "⚠ Catastrophic damage", cls: "crit" };
  if (LOCS.some((l) => rig[l].sp / rig[l].max <= 0.34)) return { text: "▲ Heavy damage — operational", cls: "warn" };
  if (LOCS.some((l) => rig[l].sp < rig[l].max)) return { text: "◆ Damaged — operational", cls: "warn" };
  return { text: "● All systems nominal", cls: "" };
}

// Build one full "Rig Control Terminal" screen for the swipe deck.
function buildRigScreen(rig) {
  const screen = document.createElement("div");
  screen.className = "rig-screen";

  const term = document.createElement("div");
  term.className = "rig-term" + (rig.destroyed ? " destroyed" : "");

  const head = document.createElement("div");
  head.className = "rig-term-head";
  const title = document.createElement("span");
  title.className = "rig-title";
  title.textContent = rig.name;
  const badge = document.createElement("span");
  badge.className = "rig-badge";
  badge.textContent = rig.weightClass;
  const rm = document.createElement("button");
  rm.className = "rig-remove";
  rm.type = "button";
  rm.textContent = "✕";
  rm.setAttribute("aria-label", `Remove ${rig.name}`);
  rm.addEventListener("click", () => sendCommand("remove", { name: rig.name }));
  head.appendChild(title);
  head.appendChild(badge);
  head.appendChild(rm);
  term.appendChild(head);

  const st = rigStatus(rig);
  const status = document.createElement("div");
  status.className = "rig-status " + st.cls;
  status.textContent = st.text;
  term.appendChild(status);

  for (const loc of LOCS) term.appendChild(compRow(rig, loc));

  screen.appendChild(term);
  return screen;
}

export function renderRigs() {
  // Rebuild the rig screens but keep the persistent add-rig screen (its inputs
  // hold live event listeners bound once at startup).
  [...rigList.querySelectorAll(".rig-screen:not(.rig-screen-add)")].forEach((n) => n.remove());
  for (const rig of S.rigs) rigList.insertBefore(buildRigScreen(rig), rigAddScreen);
  buildDots();
  updateDeck();
}

// ---- Swipe deck pager ----
function screenW() { return rigList.clientWidth || 1; }
function deckIndex() { return Math.max(0, Math.min(S.rigs.length, Math.round(rigList.scrollLeft / screenW()))); }

function buildDots() {
  rigDots.innerHTML = "";
  const n = S.rigs.length + 1; // +1 for the add screen
  for (let i = 0; i < n; i++) {
    const dot = document.createElement("button");
    dot.type = "button";
    dot.className = "deck-dot" + (i === S.rigs.length ? " add-dot" : "");
    dot.setAttribute("aria-label", i < S.rigs.length ? `Go to rig ${i + 1}` : "Go to add-rig screen");
    dot.addEventListener("click", () => scrollToIndex(i));
    rigDots.appendChild(dot);
  }
}

function setActive(i) {
  [...rigDots.children].forEach((d, idx) => d.classList.toggle("active", idx === i));
  if (i >= S.rigs.length) {
    rigDeckTitle.textContent = "New Rig";
  } else {
    const rig = S.rigs[i];
    rigDeckTitle.textContent = rig ? `${rig.name} · ${i + 1}/${S.rigs.length}` : "Squadron Status";
  }
  rigPrev.disabled = i <= 0;
  rigNext.disabled = i >= S.rigs.length;
}

function updateDeck() { setActive(deckIndex()); }

function scrollToIndex(i) {
  const idx = Math.max(0, Math.min(S.rigs.length, i));
  rigList.scrollLeft = idx * screenW(); // scroll-behavior:smooth animates this on-device
  setActive(idx);
}

rigList.addEventListener("scroll", updateDeck);
rigPrev.addEventListener("click", () => scrollToIndex(deckIndex() - 1));
rigNext.addEventListener("click", () => scrollToIndex(deckIndex() + 1));

function addRigFromForm() {
  const name = rigNameInput.value.trim();
  if (!name) { rigNameInput.focus(); return; }
  if (findRig(name)) { setStatus(`A rig named “${name}” already exists.`); return; }
  sendCommand("add", { name, class: rigClassSelect.value, owner: S.session?.side || "a" });
  rigNameInput.value = "";
}

rigAddBtn.addEventListener("click", addRigFromForm);
rigNameInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") { e.preventDefault(); addRigFromForm(); }
});

// ---- Rig sheet open/close ----
function openRigSheet() {
  sheetScrim.hidden = false;
  // Force a reflow so the scrim's display change is committed before we flip
  // the classes — this lets the opacity/transform transitions animate without
  // depending on requestAnimationFrame scheduling.
  void sheetScrim.offsetWidth;
  sheetScrim.classList.add("show");
  rigPanel.classList.add("open");
  rigPanel.setAttribute("aria-hidden", "false");
  rigToggle.classList.add("active");
  rigToggle.setAttribute("aria-pressed", "true");
  // Deck width is now measurable — snap to the first screen and sync the pager.
  scrollToIndex(0);
}
function closeRigSheet() {
  rigPanel.classList.remove("open");
  sheetScrim.classList.remove("show");
  rigPanel.setAttribute("aria-hidden", "true");
  rigToggle.classList.remove("active");
  rigToggle.setAttribute("aria-pressed", "false");
  setTimeout(() => {
    if (!rigPanel.classList.contains("open")) sheetScrim.hidden = true;
  }, 300);
}
rigToggle.addEventListener("click", () => {
  rigPanel.classList.contains("open") ? closeRigSheet() : openRigSheet();
});
rigClose.addEventListener("click", closeRigSheet);
sheetScrim.addEventListener("click", closeRigSheet);
document.addEventListener("keydown", (e) => {
  if (!rigPanel.classList.contains("open")) return;
  if (e.key === "Escape") { closeRigSheet(); return; }
  // Arrow keys page the deck, unless the user is typing in the add-rig form.
  const tag = document.activeElement && document.activeElement.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
  if (e.key === "ArrowRight") { e.preventDefault(); scrollToIndex(deckIndex() + 1); }
  else if (e.key === "ArrowLeft") { e.preventDefault(); scrollToIndex(deckIndex() - 1); }
});
