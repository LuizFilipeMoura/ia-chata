import { S } from "./state.js";
import { sendCommand } from "./api.js";
import { WEAPONS, EQUIPMENT, canAddRigForSide, WEAPON_UPGRADES } from "/shared/game-state.js";

// Multi-step "Commission a Rig" wizard: identity -> weapons (+ fixed upgrade
// preview) -> equipment (the one build decision, §15) -> confirm. Mirrors the
// attack-wizard.js scrim/card modal pattern already used for combat actions.
let scrim = null;
let onDone = () => {};

export function openRigWizard() {
  close();
  const mySide = S.session?.side || "a";
  const state = {
    step: 0,
    name: "", cls: "medium", owner: mySide,
    longRange: Object.keys(WEAPONS.longRange)[0],
    melee: Object.keys(WEAPONS.melee)[0],
    equipment: Object.keys(EQUIPMENT)[0],
  };

  scrim = document.createElement("div");
  scrim.className = "rw-scrim";
  const card = document.createElement("div");
  card.className = "rw-card";
  scrim.appendChild(card);
  scrim.addEventListener("click", (e) => { if (e.target === scrim) close(); });
  document.body.appendChild(scrim);
  render(card, state);
  void scrim.offsetWidth;
  scrim.classList.add("show");
}

const STEPS = ["Identity", "Weapons", "Equipment", "Confirm"];

function render(card, state) {
  card.innerHTML = "";
  card.appendChild(header(state));
  if (state.step === 0) card.appendChild(stepIdentity(state, card));
  else if (state.step === 1) card.appendChild(stepWeapons(state, card));
  else if (state.step === 2) card.appendChild(stepEquipment(state, card));
  else card.appendChild(stepConfirm(state, card));
  card.appendChild(nav(state, card));
}

function header(state) {
  const wrap = document.createElement("div");
  wrap.className = "rw-head";
  wrap.innerHTML = `<div class="rw-title">◈ Commission a Rig</div>`;
  const dots = document.createElement("div");
  dots.className = "rw-dots";
  STEPS.forEach((label, i) => {
    const dot = document.createElement("span");
    dot.className = "rw-dot" + (i === state.step ? " on" : i < state.step ? " done" : "");
    dot.textContent = label;
    dots.appendChild(dot);
  });
  wrap.appendChild(dots);
  return wrap;
}

function field(label, input) {
  const wrap = document.createElement("div");
  wrap.className = "rw-field";
  const l = document.createElement("label");
  l.textContent = label;
  wrap.appendChild(l);
  wrap.appendChild(input);
  return wrap;
}

function select(options, selected, onChange) {
  const sel = document.createElement("select");
  for (const opt of options) {
    const o = document.createElement("option");
    o.value = opt; o.textContent = opt;
    if (opt === selected) o.selected = true;
    sel.appendChild(o);
  }
  sel.addEventListener("change", () => onChange(sel.value));
  return sel;
}

function stepIdentity(state) {
  const body = document.createElement("div");
  body.className = "rw-body";
  const nameInput = document.createElement("input");
  nameInput.type = "text"; nameInput.placeholder = "Rig name"; nameInput.value = state.name;
  nameInput.className = "rw-name";
  nameInput.addEventListener("input", () => (state.name = nameInput.value));
  body.appendChild(field("Name", nameInput));
  body.appendChild(field("Weight class", select(["light", "medium"], state.cls, (v) => (state.cls = v))));
  const mySide = S.session?.side || "a";
  const enemySide = mySide === "a" ? "b" : "a";
  const ownerSel = select([mySide, enemySide], state.owner, (v) => (state.owner = v));
  ownerSel.querySelector(`option[value="${mySide}"]`).textContent = "You";
  ownerSel.querySelector(`option[value="${enemySide}"]`).textContent = "Enemy";
  body.appendChild(field("Side", ownerSel));
  return body;
}

function upgradeTags(name) {
  const wrap = document.createElement("div");
  wrap.className = "rw-upgrades";
  for (const u of WEAPON_UPGRADES[name] || []) {
    const tag = document.createElement("span");
    tag.className = "rw-upgrade-tag";
    tag.title = u.tag;
    tag.textContent = u.name;
    wrap.appendChild(tag);
  }
  return wrap;
}

function stepWeapons(state, card) {
  const body = document.createElement("div");
  body.className = "rw-body";
  body.appendChild(field("Long range weapon",
    select(Object.keys(WEAPONS.longRange), state.longRange, (v) => { state.longRange = v; render(card, state); })));
  body.appendChild(upgradeTags(state.longRange));
  body.appendChild(field("Melee weapon",
    select(Object.keys(WEAPONS.melee), state.melee, (v) => { state.melee = v; render(card, state); })));
  body.appendChild(upgradeTags(state.melee));
  const hint = document.createElement("div");
  hint.className = "rw-hint";
  hint.textContent = "Every weapon carries two fixed signature upgrades — they are its identity, not a choice.";
  body.appendChild(hint);
  return body;
}

function stepEquipment(state, card) {
  const body = document.createElement("div");
  body.className = "rw-body";
  const grid = document.createElement("div");
  grid.className = "rw-equip-grid";
  for (const [id, e] of Object.entries(EQUIPMENT)) {
    const opt = document.createElement("button");
    opt.type = "button";
    opt.className = "rw-equip-card" + (id === state.equipment ? " sel" : "");
    opt.innerHTML = `
      <div class="rw-equip-family">${e.family}</div>
      <div class="rw-equip-label">${e.label}</div>
      <div class="rw-equip-passive">${e.passive}</div>
      <div class="rw-equip-active"><b>${e.active.label}</b> (${e.active.heat >= 0 ? "+" : ""}${e.active.heat} heat) — ${e.active.text}</div>
    `;
    opt.addEventListener("click", () => { state.equipment = id; render(card, state); });
    grid.appendChild(opt);
  }
  body.appendChild(grid);
  return body;
}

function stepConfirm(state) {
  const body = document.createElement("div");
  body.className = "rw-body rw-confirm";
  const e = EQUIPMENT[state.equipment];
  const nameLine = document.createElement("div");
  nameLine.className = "rw-confirm-name";
  nameLine.textContent = `${state.name || "(unnamed)"} — ${state.cls}`;
  body.appendChild(nameLine);
  body.insertAdjacentHTML("beforeend", `
    <div class="rw-confirm-row">${state.longRange} / ${state.melee}</div>
    <div class="rw-confirm-row">${e.label} — ${e.passive}</div>
  `);
  return body;
}

function nav(state, card) {
  const wrap = document.createElement("div");
  wrap.className = "rw-nav";
  if (state.step > 0) {
    const back = document.createElement("button");
    back.type = "button"; back.className = "rw-btn ghost"; back.textContent = "Back";
    back.addEventListener("click", () => { state.step -= 1; render(card, state); });
    wrap.appendChild(back);
  }
  const canAdd = canAddRigForSide(S, state.owner);
  const next = document.createElement("button");
  next.type = "button";
  next.className = "rw-btn";
  const atName = state.step === 0 && !state.name.trim();
  if (state.step < STEPS.length - 1) {
    next.textContent = "Next";
    next.disabled = atName;
    next.addEventListener("click", () => { state.step += 1; render(card, state); });
  } else {
    next.textContent = canAdd ? "Commission" : "Roster full";
    next.disabled = !canAdd;
    next.addEventListener("click", () => submit(state));
  }
  wrap.appendChild(next);
  return wrap;
}

function submit(state) {
  sendCommand("add", {
    name: state.name.trim(),
    class: state.cls,
    owner: state.owner,
    lr: state.longRange,
    melee: state.melee,
    equipment: state.equipment,
  });
  onDone();
  close();
}

export function onRigWizardDone(fn) { onDone = fn; }

function close() {
  if (!scrim) return;
  const el = scrim;
  scrim = null;
  el.classList.remove("show");
  setTimeout(() => el.remove(), 250);
}
