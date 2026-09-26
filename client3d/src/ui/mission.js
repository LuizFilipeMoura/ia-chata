// Campaign mission layer for the battle HUD: the contract strip under the top
// bar (what this contract wants + live progress), the words for how a mission
// ended, and the small lookups the scene / nameplates share. Everything reads
// publicState's `state.campaign` (null outside the campaign: nothing renders).
import { el } from "./dom.js";
import { icon } from "./icons.js";
import { LOCS, MAX_ROUNDS } from "/shared/game-state.js";
import { CONTRACT_TYPES } from "/shared/campaign/catalog.js";

// 0 = no round limit (the Warlord fight): Infinity, shown without a " / N".
export const maxRoundsOf = (g) => (g?.maxRounds === 0 ? Infinity : g?.maxRounds || MAX_ROUNDS);
export const roundOf = (g) => `${g?.round || 1}${g?.maxRounds === 0 ? "" : ` / ${maxRoundsOf(g)}`}`;

// Assassination marks a Commander; the boss contract a Warlord.
export const commanderTitle = (c) => (c?.type === "boss" ? "Warlord" : "Commander");

const CONTRACT_ICON = { beacons: "beacon", skirmish: "melee", assassinate: "crown", breakthrough: "extract", laststand: "relay", salvage: "crate", boss: "crown" };

const spOf = (r) => LOCS.reduce((a, l) => [a[0] + (r?.[l]?.sp ?? 0), a[1] + (r?.[l]?.max ?? 0)], [0, 0]);

// The next Last Stand drop still to come: { round, name } | null.
export function nextReinforcement(c) {
  return (c?.reinforcements || []).filter((rf) => !rf.arrived).sort((a, b) => a.round - b.round)[0] || null;
}

// The contract strip. `meta` (optional): { faction } from the briefing.
export function missionPanel(state, side, meta = null) {
  const c = state.campaign;
  if (!c) return null;
  const g = state.game;
  const R = maxRoundsOf(g), round = g.round || 1;
  const t = CONTRACT_TYPES[c.type] || { name: c.type };
  const rows = [];
  let objective = t.blurb || "";
  const bar = (f, cls = "") => el("span", { class: `ms-bar ${cls}` }, el("i", { style: { width: `${Math.max(0, Math.min(1, f)) * 100}%` } }));
  const pips = (n, max, cls) => el("span", { class: `ms-pips ${cls}` }, Array.from({ length: max }, (_, i) => el("i", { class: i < n ? "on" : "" })));

  if (c.type === "assassinate" || c.type === "boss") {
    const title = commanderTitle(c);
    const cmd = state.rigs.find((r) => r.id === c.commanderId);
    objective = R === Infinity ? `Wreck the marked ${title}. No round limit: it ends when one side falls.` : `Wreck the marked ${title} before round ${R} ends.`;
    if (cmd && !cmd.destroyed) {
      const [sp, max] = spOf(cmd);
      rows.push(el("div", { class: "ms-row" }, icon("crown"), el("b", {}, `${title}: ${cmd.name}`), el("span", { class: "ms-state alive" }, "alive"), bar(max ? sp / max : 0, "b"), el("span", { class: "ms-num" }, `${sp}/${max} SP`)));
    } else rows.push(el("div", { class: "ms-row" }, icon("crown"), el("b", {}, `${title}: ${cmd?.name || "?"}`), el("span", { class: "ms-state down" }, "down")));
  } else if (c.type === "breakthrough") {
    const n = c.extracted?.length || 0, goal = c.extractGoal || 1;
    objective = `Extract ${goal} rig${goal > 1 ? "s" : ""} through the enemy corner before round ${R} ends.`;
    const left = state.rigs.filter((r) => r.owner === side && !r.destroyed).length;
    rows.push(el("div", { class: "ms-row" }, icon("extract"), el("b", {}, `Extracted ${n}/${goal}`), pips(n, goal, "a"),
      n ? el("span", { class: "ms-num" }, c.extracted.map((r) => r.name).join(", ")) : null));
    if (g.phase !== "finished") rows.push(el("div", { class: `ms-hint ${left < goal - n ? "warn" : ""}` }, left < goal - n
      ? `Only ${left} rig${left === 1 ? "" : "s"} left for ${goal - n} more extraction${goal - n > 1 ? "s" : ""}.`
      : "Reach the glowing zone at the enemy corner, then Extract (1 action, not while locked in melee)."));
  } else if (c.type === "laststand") {
    const togo = Math.max(0, R - round);
    objective = `Keep a rig standing to the end of round ${R}.`;
    rows.push(el("div", { class: "ms-row" }, icon("relay"), el("b", {}, `Hold until round ${R}`), el("span", { class: "ms-num" }, togo ? `${togo} more round${togo > 1 ? "s" : ""} after this` : "Final round!")));
    const nx = nextReinforcement(c);
    rows.push(el("div", { class: `ms-row ${nx && nx.round - round <= 1 ? "soon" : ""}` }, icon("drop"), nx
      ? el("span", {}, "Next reinforcement: ", el("b", {}, `round ${nx.round}`), nx.name ? ` (${nx.name})` : "", nx.round > round ? `, in ${nx.round - round}` : "")
      : el("span", { class: "muted" }, "No more reinforcements inbound.")));
  } else if (c.type === "salvage") {
    const left = (g.objectives || []).filter((o) => o.crate).length;
    const mine = c.crates?.[side] || 0, theirs = c.crates?.[side === "a" ? "b" : "a"] || 0;
    objective = `End an activation within 2" of a crate to haul it (+2 VP). More VP after round ${R} wins.`;
    rows.push(el("div", { class: "ms-row" }, icon("crate"), el("b", {}, "Crates: "), el("span", { class: "c-a" }, `you ${mine}`), " · ", el("span", { class: "c-b" }, `enemy ${theirs}`), el("span", { class: "ms-num" }, `(${left} left)`)));
  } else if (c.type === "skirmish") {
    objective = `Hold the centre beacon and trade kills: more VP after round ${R} wins, or wipe them out.`;
  } else if (c.type === "beacons") {
    objective = `Hold the beacons: more VP after round ${R} wins. Kills score too.`;
  }
  return el("div", { class: `hud-mission t-${c.type}` },
    el("div", { class: "ms-head" }, icon(CONTRACT_ICON[c.type] || "beacon"), el("b", {}, t.name), meta?.faction ? el("span", { class: "ms-fac" }, `vs ${meta.faction}`) : null,
      null),
    el("div", { class: "ms-obj" }, objective),
    rows);
}

// How a battle ended, in words (campaign reasons first, then the standard ones).
// `side`: whose point of view ("a" in the campaign).
export function outcomeWords(o, campaign = null, side = "a") {
  const won = o?.winner === side;
  switch (o?.reason) {
    case "commander": return `${commanderTitle(campaign)} down`;
    case "extraction": return "Broke through";
    case "survived": return "Held the line";
    case "timeout": return "Out of time";
    case "stranded": return "No one left to extract";
    case "annihilation": return won ? "Enemy squad wiped out" : "Squadron wiped out";
    case "draw": return "Dead even";
    case "points": return won ? "Won on victory points" : "Lost on victory points";
    default: return o?.reason ? String(o.reason) : "";
  }
}
