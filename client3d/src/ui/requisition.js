// The quartermaster's counter: upgrades come out of a coin-op vending machine,
// Prototypes hang as carved bone charms with their curse etched underneath,
// and a squadron is signed for on a typewritten requisition form that gets a
// COMMISSIONED rubber stamp. Display only: the picks and rules are unchanged.
import "./posters.css";
import { el } from "./dom.js";
import { sfx } from "../audio.js";
import { NATURE_LABEL, hashSeed } from "./moments-logic.js";
import { reducedMotion } from "./posters.js";

export const natureBadge = (nature, cls = "") => el("i", { class: `nat-badge n-${nature} ${cls}` }, NATURE_LABEL[nature] || nature);

// The deco cabinet around a set of vending rows.
export function vendingMachine(rows, { marquee = "ARMS FOR THE ARMED", slogan = "Dispensed while you wait. No refunds on the front." } = {}) {
  return el("div", { class: "vend" },
    el("div", { class: "vend-marquee" }, el("b", {}, marquee), el("small", {}, slogan)),
    el("div", { class: "vend-body" },
      el("div", { class: "vend-rows" }, rows),
      el("div", { class: "vend-side", "aria-hidden": "true" },
        el("div", { class: "vend-coin" }, el("i", {}), el("span", {}, "INSERT COIN")),
        el("div", { class: "vend-return" }, "RETURN"))),
    el("div", { class: "vend-tray", "aria-hidden": "true" }));
}

// One vending button. Picking it drops a coin (sfx) and dispenses.
let justPicked = null;
export function vendSlot(x, { code, on, blocked, title, onPick, key }) {
  const fresh = key && justPicked === key;
  if (fresh) setTimeout(() => { if (justPicked === key) justPicked = null; }, 0);
  return el("button", {
    class: `vend-slot n-${x.nature} ${on ? "on" : ""} ${fresh ? "dispense" : ""} ${x.nature === "prototype" ? "charm-slot" : ""}`,
    disabled: blocked, title,
    onClick: () => { justPicked = key; sfx.coin?.(); onPick(); },
  }, el("span", { class: "vs-code" }, code), natureBadge(x.nature), el("span", { class: "vs-name" }, x.name));
}

// A Prototype upgrade as a carved bone charm: name and effect etched in, its
// downside (the upgrade's `catch`) written as a curse.
export function boneCharm(u, { compact = false } = {}) {
  if (!u) return null;
  return el("div", { class: `charm ${compact ? "compact" : ""}` },
    el("i", { class: "charm-cord", "aria-hidden": "true" }),
    el("div", { class: "charm-plate" },
      el("div", { class: "charm-k" }, NATURE_LABEL.prototype),
      el("b", { class: "charm-name" }, u.name),
      u.tag ? el("div", { class: "charm-etch" }, u.tag) : null,
      u.catch ? el("div", { class: "charm-curse" }, el("span", {}, "Curse: "), u.catch) : null));
}

// ---- Requisition form -------------------------------------------------------

// rows: [[label, value], ...]. Returns the sheet (with its carbon copy behind).
export function requisitionForm({ title = "Requisition of War Materiel", rows = [], note = "", serial = null } = {}) {
  const no = serial || `27-B/${String(hashSeed(rows.map((r) => r.join(":")).join("|")) % 9000 + 1000)}`;
  const sheet = el("div", { class: "req-sheet" },
    el("div", { class: "req-head" },
      el("div", { class: "req-dept" }, "WAR DEPARTMENT · QUARTERMASTER GENERAL"),
      el("div", { class: "req-title" }, title),
      el("div", { class: "req-no" }, `Form ${no}`)),
    el("table", { class: "req-table" }, rows.map(([k, v]) => el("tr", {}, el("th", {}, k), el("td", {}, el("span", { class: "req-typed" }, v))))),
    note ? el("p", { class: "req-note" }, note) : null,
    el("div", { class: "req-sign" }, el("span", {}, "Signed:"), el("i", {}, "Commanding Officer")),
    el("div", { class: "req-stamp", "aria-hidden": "true" }, "COMMISSIONED"));
  return el("div", { class: "requisition" }, el("div", { class: "req-carbon", "aria-hidden": "true" }), sheet);
}

// Thunk the stamp onto a form, then run `then` once it has landed.
export function stampThen(form, then, { hold = 650 } = {}) {
  const calm = reducedMotion();
  setTimeout(() => { form.classList.add("stamped"); sfx.stamp?.(); }, calm ? 0 : 180);
  setTimeout(then, (calm ? 250 : 180 + 260) + hold);
}

// A full-screen requisition for a moment, stamped, then gone: the skirmish
// squad builder's deploy. Clicking skips ahead.
export function requisitionOverlay(opts, then) {
  let done = false;
  const go = () => { if (done) return; done = true; back.remove(); then(); };
  const form = requisitionForm(opts);
  const back = el("div", { class: "req-back", onClick: go }, form);
  document.body.append(back);
  stampThen(form, go, { hold: 900 });
}
