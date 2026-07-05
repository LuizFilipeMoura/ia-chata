import { S, LOCS } from "./state.js";
import { sendCommand } from "./api.js";
import { setStatus } from "./status.js";
import { MAX_RIGS_PER_SIDE, MAX_RIGS_TOTAL, EQUIPMENT, WEAPON_UPGRADES, canAddRigForSide, heatMeter } from "/shared/game-state.js";
import { rigModifiers } from "/shared/battle-view.js";
import { buildActionConsole } from "./battle.js";
import { openRigWizard, onRigWizardDone } from "./rig-wizard.js";

const rigList = document.getElementById("rigList");
const rigAddBtn = document.getElementById("rigAddBtn");
const rigAddScreen = document.getElementById("rigAddScreen");
const rigDeckTitle = document.getElementById("rigDeckTitle");
const battleSetup = document.getElementById("battleSetup");
const battleReadyStatus = document.getElementById("battleReadyStatus");
const battleBounty = document.getElementById("battleBounty");
const readyBattle = document.getElementById("readyBattle");
const diceMode = document.getElementById("diceMode");

// ---- Local view state (never leaves the client) ----
// The "active" Rig is the one currently taking its activation; only it may
// manage heat, mirroring the tabletop rule that heat accrues on the acting Rig.
let activeRigId = null;
const expanded = new Set();       // rig ids whose accordion body is open
const prevHeat = new Map();       // rig id -> last rendered heat, to flash on change

function barClass(c) {
  if (c.destroyed) return "rig-fill-dead";
  if (c.sp === 0) return "rig-fill-crit";
  const ratio = c.sp / c.max;
  if (ratio <= 0.34) return "rig-fill-low";
  if (ratio <= 0.67) return "rig-fill-warn";
  return "rig-fill-ok";
}

function ownerLabel(owner) {
  return (owner || "a") === (S.session?.side || "a") ? "Your Squadron" : "Enemy";
}

function orderedRigs() {
  const mySide = S.session?.side || "a";
  const enemySide = mySide === "a" ? "b" : "a";
  return [
    ...S.rigs.filter((rig) => (rig.owner || "a") === mySide),
    ...S.rigs.filter((rig) => (rig.owner || "a") === enemySide),
  ];
}

function sideName(sideId) {
  return S.game?.sides?.find((side) => side.id === sideId)?.name || (sideId === "a" ? "Side A" : "Side B");
}

function sideReady(sideId) {
  return Boolean(S.game?.sides?.find((side) => side.id === sideId)?.ready);
}

function sideRigCount(sideId) {
  return S.rigs.filter((rig) => (rig.owner || "a") === sideId).length;
}

function addLimitMessage(owner) {
  if (S.rigs.length >= MAX_RIGS_TOTAL) return `Roster full: ${MAX_RIGS_TOTAL} rigs are already in place.`;
  if (sideRigCount(owner) >= MAX_RIGS_PER_SIDE) return `Side full: ${MAX_RIGS_PER_SIDE} rigs are already assigned.`;
  return "";
}

function updateAddRigAvailability() {
  const owner = S.session?.side || "a";
  const canAdd = canAddRigForSide(S, owner);
  const message = addLimitMessage(owner);
  rigAddBtn.disabled = !canAdd;
  rigAddBtn.textContent = canAdd ? "+ Commission" : "Full";
  rigAddBtn.title = message;
  rigAddScreen.classList.toggle("rig-add-locked", !canAdd);
  // First-run empty state: when this side has no Rigs yet, the commission card
  // grows into a centered "start here" call rather than a quiet footer button.
  const isEmpty = sideRigCount(owner) === 0 && !Boolean(S.game?.started);
  rigAddScreen.classList.toggle("is-empty", isEmpty);
  const title = rigAddScreen.querySelector(".rig-add-title");
  if (title) title.textContent = isEmpty ? "◈ Your squadron is empty" : "◈ Commission a Rig";
  const hint = rigAddScreen.querySelector(".rig-add-hint");
  if (hint) {
    hint.textContent = message
      || (isEmpty
        ? "Commission your first Rig to begin — name it, pick a weight class and weapons."
        : "Name it, pick a weight class and weapons, then choose its equipment.");
  }
}

function renderBattleSetup() {
  if (!battleSetup || !readyBattle) return;
  const mySide = S.session?.side || "a";
  const enemySide = mySide === "a" ? "b" : "a";
  const myCount = sideRigCount(mySide);
  const started = Boolean(S.game?.started);

  if (started) {
    const bountyId = S.game?.bounties?.[mySide];
    const bounty = S.rigs.find((rig) => rig.id === bountyId);
    battleReadyStatus.textContent = "Battle started";
    battleBounty.textContent = bounty ? `Ironclad Bounty: ${bounty.name}` : "Ironclad Bounty: awaiting target";
    readyBattle.disabled = true;
    readyBattle.textContent = "Started";
    if (diceMode) {
      const auto = S.game?.autoResolve !== false;
      diceMode.textContent = auto ? "🎲 Auto" : "🎲 Manual";
      diceMode.setAttribute("aria-pressed", String(auto));
      diceMode.disabled = started;
    }
    return;
  }

  const myReady = sideReady(mySide);
  const enemyReady = sideReady(enemySide);
  battleReadyStatus.textContent = `${sideName(mySide)} ${myReady ? "Ready" : "Not ready"} · ${sideName(enemySide)} ${enemyReady ? "Ready" : "Not ready"}`;
  battleBounty.textContent = myCount >= 3
    ? "Mark Ready after your final lineup is set."
    : `Choose ${3 - myCount} more Rig${3 - myCount === 1 ? "" : "s"} to ready up.`;
  readyBattle.disabled = myReady || myCount < 3;
  readyBattle.textContent = myReady ? "Ready" : "Ready";

  if (diceMode) {
    const auto = S.game?.autoResolve !== false;
    diceMode.textContent = auto ? "🎲 Auto" : "🎲 Manual";
    diceMode.setAttribute("aria-pressed", String(auto));
    diceMode.disabled = started;
  }
}

// One structure-point component row (hull / arms / legs / engine): damage,
// bar, repair. Heat lives in its own gauge, not here.
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
  return row;
}

// The heat gauge — the centrepiece control. A segmented thermometer that reads
// left-to-right up to the Rig's Heat Capacity (the redline), then into a red
// overheat zone. When hot, it spells out the exact misfire roll (§6) so the
// player knows precisely what's at stake. Controls are live only for the
// active Rig.
function buildHeatGauge(rig, isActive) {
  const m = heatMeter(rig);
  const displayMax = m.cap + 4;
  const shownHeat = Math.min(m.heat, displayMax);

  const gauge = document.createElement("div");
  gauge.className = "heat-gauge";
  gauge.dataset.zone = m.zone;
  if (!isActive) gauge.classList.add("heat-gauge--idle");
  const prior = prevHeat.get(rig.id);
  if (prior != null && m.heat !== prior) {
    gauge.classList.add(m.heat > prior ? "heat-gauge--up" : "heat-gauge--down");
  }

  const head = document.createElement("div");
  head.className = "heat-gauge-head";
  const label = document.createElement("span");
  label.className = "heat-gauge-label";
  label.textContent = "Engine Heat";
  const read = document.createElement("span");
  read.className = "heat-gauge-read";
  read.innerHTML = `<b>${m.heat}</b><span class="heat-gauge-cap">/${m.cap}</span>`;
  head.appendChild(label);
  head.appendChild(read);
  gauge.appendChild(head);

  const track = document.createElement("div");
  track.className = "heat-track";
  for (let i = 0; i < displayMax; i++) {
    const seg = document.createElement("span");
    seg.className = "heat-seg";
    if (i >= m.cap) seg.classList.add("heat-seg--danger");
    if (i === m.cap) seg.classList.add("heat-seg--redline"); // first overheat cell = the redline
    if (i < shownHeat) {
      seg.classList.add("heat-seg--on");
      // Warmth ramp across the safe zone: cool at the left, amber near the redline.
      seg.style.setProperty("--warm", (m.cap > 1 ? Math.min(1, i / (m.cap - 1)) : 1).toFixed(3));
    }
    track.appendChild(seg);
  }
  gauge.appendChild(track);

  const status = document.createElement("div");
  status.className = "heat-status";
  if (m.zone === "over") {
    status.innerHTML = `<span class="heat-status-tag">▲ Overheating</span>` +
      `<span class="heat-status-roll">misfire roll = D12 + ${m.bonus}</span>`;
  } else if (m.zone === "redline") {
    status.innerHTML = `<span class="heat-status-tag">At redline</span>` +
      `<span class="heat-status-sub">one more point triggers a misfire check</span>`;
  } else if (m.zone === "cold") {
    status.innerHTML = `<span class="heat-status-tag">Engine idle</span>` +
      `<span class="heat-status-sub">cold — full ${m.cap} of headroom</span>`;
  } else {
    const room = m.cap - m.heat;
    status.innerHTML = `<span class="heat-status-tag">${m.zone === "warm" ? "Running hot" : "Nominal"}</span>` +
      `<span class="heat-status-sub">${room} heat to redline</span>`;
  }
  if (m.floor > 0) {
    const lock = document.createElement("span");
    lock.className = "heat-status-lock";
    lock.textContent = `Engine wrecked · heat locked ≥ ${m.floor}`;
    status.appendChild(lock);
  }
  gauge.appendChild(status);

  const controls = document.createElement("div");
  controls.className = "heat-controls";
  const mkBtn = (cls, text, aria, spec) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "heat-btn " + cls;
    b.textContent = text;
    b.setAttribute("aria-label", aria);
    b.disabled = !isActive || Boolean(S.game?.started);
    b.addEventListener("click", () => sendCommand("heat", { name: rig.name, amount: spec }));
    return b;
  };
  controls.appendChild(mkBtn("heat-btn-cool", "Shut Down", "Shut down — set heat to 0", "0"));
  controls.appendChild(mkBtn("heat-btn-vent", "Vent −2", "Vent — cool 2 heat", "-2"));
  controls.appendChild(mkBtn("heat-btn-minus", "−1", "Cool 1 heat", "-1"));
  controls.appendChild(mkBtn("heat-btn-plus", "＋1", "Add 1 heat", "+1"));
  gauge.appendChild(controls);

  if (!isActive) {
    const hint = document.createElement("div");
    hint.className = "heat-locked-hint";
    hint.textContent = "Set this Rig active to run its engine";
    gauge.appendChild(hint);
  }

  prevHeat.set(rig.id, m.heat);
  return gauge;
}

// Overall condition summary shown on a Rig's accordion header/body.
function rigStatus(rig) {
  if (rig.destroyed) return { text: "⛔ System failure — destroyed", cls: "crit" };
  if (LOCS.some((l) => rig[l].sp === 0)) return { text: "⚠ Catastrophic damage", cls: "crit" };
  if (LOCS.some((l) => rig[l].sp / rig[l].max <= 0.34)) return { text: "▲ Heavy damage — operational", cls: "warn" };
  if (LOCS.some((l) => rig[l].sp < rig[l].max)) return { text: "◆ Damaged — operational", cls: "warn" };
  return { text: "● All systems nominal", cls: "" };
}

// Build one accordion entry: a header that is always visible (name, class,
// heat chip, active toggle) and a collapsible body with the full terminal.
function buildRigItem(rig) {
  const started = Boolean(S.game?.started);
  const mySide = S.session?.side || "a";
  // In battle, "active" and open follow the server's turn so the acting Rig
  // reveals its action console; before battle it's the local heat-gauge toggle.
  const serverActive = started && S.game?.turn?.activeRigId === rig.id;
  const isActive = started ? serverActive : rig.id === activeRigId;
  const isOpen = expanded.has(rig.id) || serverActive;
  const m = heatMeter(rig);

  const item = document.createElement("div");
  item.className = "rig-item";
  if (rig.destroyed) item.classList.add("is-destroyed");
  if (isActive) item.classList.add("is-active");
  if (isOpen) item.classList.add("is-open");

  // ---- Header (click to expand) ----
  const header = document.createElement("div");
  header.className = "rig-head";
  header.setAttribute("role", "button");
  header.setAttribute("tabindex", "0");
  header.setAttribute("aria-expanded", String(isOpen));

  const st = rigStatus(rig);
  const dot = document.createElement("span");
  dot.className = "rig-dot " + (st.cls || "ok");

  const name = document.createElement("span");
  name.className = "rig-head-name";
  name.textContent = rig.name;

  const cls = document.createElement("span");
  cls.className = "rig-badge";
  cls.textContent = rig.weightClass;

  const heatChip = document.createElement("span");
  heatChip.className = "rig-heat-chip";
  heatChip.dataset.zone = m.zone;
  heatChip.innerHTML = `<span class="rig-heat-chip-ic">🔥</span>${m.heat}`;
  heatChip.title = m.over > 0 ? `Overheating: misfire roll D12 + ${m.bonus}` : `Heat ${m.heat} of ${m.cap}`;

  // During battle, activation is server-authoritative: only the side whose turn
  // it is may activate one of its own un-activated Rigs, one at a time.
  const isMine = (rig.owner || "a") === mySide;
  const canActivate = started && S.game?.phase === "activation" &&
    S.game?.turn?.side === mySide && isMine &&
    S.game?.turn?.activeRigId == null && !rig.activated && !rig.destroyed;

  // Enemy Rigs, in battle, expose no activation control — you can't drive them.
  // Show a read-only status token instead ("● Active" / "Done" / "Inactive").
  let activate;
  if (started && !isMine) {
    activate = document.createElement("span");
    activate.className = "rig-activate rig-activate--readonly" + (isActive ? " on" : "");
    activate.textContent = isActive ? "● Active" : (rig.activated ? "Done" : "Inactive");
    activate.title = isActive ? "This enemy Rig is taking its activation"
      : rig.activated ? "This enemy Rig has already acted this round" : "This enemy Rig is idle";
  } else {
    activate = document.createElement("button");
    activate.type = "button";
    activate.className = "rig-activate" + (isActive ? " on" : "");
    activate.setAttribute("aria-pressed", String(isActive));
    activate.textContent = isActive ? "● Active" : (started && rig.activated ? "Done" : "Activate");
    // In battle the button is live only on your own turn; before battle it's the
    // local heat-gauge preview toggle for your Rigs.
    activate.title = isActive ? "This Rig is taking its activation"
      : started ? (canActivate ? "Activate this Rig" : "Wait for your turn to activate")
      : isMine ? "Preview this Rig's heat gauge" : "You can only preview your own Rig's heat gauge";
    activate.disabled = started ? !canActivate : !isMine;
    activate.addEventListener("click", (e) => {
      e.stopPropagation();
      if (started) {
        if (canActivate) sendCommand("activate", { name: rig.name });
      } else if (isMine) {
        setActiveRig(isActive ? null : rig.id);
      }
    });
  }

  const chev = document.createElement("span");
  chev.className = "rig-chev";
  chev.textContent = "▾";

  header.appendChild(dot);
  header.appendChild(name);
  header.appendChild(cls);
  header.appendChild(heatChip);
  header.appendChild(activate);
  header.appendChild(chev);
  header.addEventListener("click", () => toggleExpanded(rig.id));
  header.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleExpanded(rig.id); }
  });
  item.appendChild(header);

  // ---- Body (collapsible) ----
  const body = document.createElement("div");
  body.className = "rig-body";

  const inner = document.createElement("div");
  inner.className = "rig-body-inner";

  const status = document.createElement("div");
  status.className = "rig-status " + st.cls;
  status.textContent = st.text;
  inner.appendChild(status);

  const mods = rigModifiers(rig);
  if (mods.length) {
    const modRow = document.createElement("div");
    modRow.className = "rig-mods";
    for (const m of mods) {
      const chip = document.createElement("span");
      chip.className = "rig-mod";
      chip.dataset.tone = m.tone;
      chip.textContent = m.tag;
      modRow.appendChild(chip);
    }
    inner.appendChild(modRow);
  }

  if (rig.weapons) {
    const weapons = document.createElement("div");
    weapons.className = "rig-weapons";
    const lrUpgrade = (WEAPON_UPGRADES[rig.weapons.longRange] || []).find((u) => u.id === rig.weaponUpgrades?.longRange);
    const meleeUpgrade = (WEAPON_UPGRADES[rig.weapons.melee] || []).find((u) => u.id === rig.weaponUpgrades?.melee);
    weapons.textContent = `${rig.weapons.longRange || "Long Range ?"} (${lrUpgrade?.name || "Upgrade ?"}) / ${rig.weapons.melee || "Melee ?"} (${meleeUpgrade?.name || "Upgrade ?"})`;
    inner.appendChild(weapons);
    if (rig.equipment && EQUIPMENT[rig.equipment]) {
      const eq = EQUIPMENT[rig.equipment];
      const equipEl = document.createElement("div");
      equipEl.className = "rig-equipment";
      equipEl.innerHTML = `<b>${eq.label}</b> — ${eq.passive}`;
      inner.appendChild(equipEl);
    }
  }

  for (const loc of LOCS) inner.appendChild(compRow(rig, loc));

  inner.appendChild(buildHeatGauge(rig, isActive));

  if (S.game?.started) inner.appendChild(buildActionConsole(rig));

  const rm = document.createElement("button");
  rm.className = "rig-remove-row";
  rm.type = "button";
  rm.textContent = "✕ Remove Rig";
  rm.setAttribute("aria-label", `Remove ${rig.name}`);
  rm.addEventListener("click", () => sendCommand("remove", { name: rig.name }));
  inner.appendChild(rm);

  body.appendChild(inner);
  item.appendChild(body);
  return item;
}

function groupHead(text) {
  const el = document.createElement("div");
  el.className = "rig-group-head";
  el.textContent = text;
  return el;
}

export function renderRigs() {
  renderBattleSetup();
  updateAddRigAvailability();

  const rigs = orderedRigs();
  // Drop local view state that points at Rigs which no longer exist.
  const ids = new Set(rigs.map((r) => r.id));
  if (activeRigId != null && !ids.has(activeRigId)) activeRigId = null;
  for (const id of [...expanded]) if (!ids.has(id)) expanded.delete(id);
  for (const id of [...prevHeat.keys()]) if (!ids.has(id)) prevHeat.delete(id);

  // Rebuild the list but keep the persistent add card (its inputs hold live
  // listeners bound once at startup).
  [...rigList.querySelectorAll(".rig-item, .rig-group-head")].forEach((n) => n.remove());

  let lastGroup = null;
  for (const rig of rigs) {
    const group = ownerLabel(rig.owner);
    if (group !== lastGroup) {
      rigList.insertBefore(groupHead(group === "Your Squadron" ? "Your Squadron" : "Enemy"), rigAddScreen);
      lastGroup = group;
    }
    rigList.insertBefore(buildRigItem(rig), rigAddScreen);
  }

  const active = rigs.find((r) => r.id === activeRigId);
  rigDeckTitle.textContent = active ? `Active · ${active.name}` : "Squadron Status";
}

function toggleExpanded(id) {
  if (expanded.has(id)) expanded.delete(id);
  else expanded.add(id);
  renderRigs();
}

function setActiveRig(id) {
  activeRigId = id;
  if (id != null) expanded.add(id); // reveal the controls you just unlocked
  renderRigs();
}

rigAddBtn.addEventListener("click", () => {
  const owner = S.session?.side || "a";
  if (!canAddRigForSide(S, owner)) { setStatus(addLimitMessage(owner)); updateAddRigAvailability(); return; }
  openRigWizard();
});
onRigWizardDone(() => setStatus(""));
readyBattle?.addEventListener("click", () => {
  const side = S.session?.side || "a";
  sendCommand("ready", { side });
});
diceMode?.addEventListener("click", () => {
  const auto = S.game?.autoResolve !== false;
  sendCommand("setdice", { value: auto ? "manual" : "auto" });
});
