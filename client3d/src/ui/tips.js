// "Wire from HQ": situational, one-time teaching. Instead of front-loading every
// rule into the tutorial, a telegram arrives the first time a situation actually
// comes up, your gun is spent, an enemy shows you its back, your boiler nears
// the red. Each wire fires once per browser (localStorage) and can be switched
// off in Settings.
import { el } from "./dom.js";
import { settings } from "../settings.js";
import { heatMeter, inExitZone } from "/shared/game-state.js";
import { candidatesFor } from "/shared/bot/candidates.js";
import { controlsObjective } from "/shared/geometry.js";
import { spatial } from "/shared/game-state.js";
import { sfx } from "../audio.js";

const SEEN_KEY = "oi3d-wires";
let seen = new Set();
try { seen = new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || "[]")); } catch {}
const markSeen = (id) => { seen.add(id); try { localStorage.setItem(SEEN_KEY, JSON.stringify([...seen])); } catch {} };
export function resetWires() { seen = new Set(); try { localStorage.removeItem(SEEN_KEY); } catch {} }

// Each: id, when(ctx) → truthy (or a string to interpolate), text(ctx, hit).
const WIRES = [
  { id: "priority", when: (c) => c.myTarget, text: (c) => `HQ has marked ${c.myTarget.name} (★). Every wreck is worth +1 victory point; scrapping this one pays +2 more.` },
  { id: "activation", when: (c) => c.rig && c.myTurn && c.rig.owner === c.side, text: () => `Each rig acts once per round: up to 3 actions, then the enemy answers with one of theirs. Pick your rig carefully.` },
  { id: "heat-near", when: (c) => c.rig && c.meter && c.meter.heat >= c.meter.cap - 1 && c.meter.heat > 0, text: (c) => `${c.rig.name}'s boiler is near the red. Every action adds heat and only 1 bleeds off per round. Past the line, ending the turn rolls on the overheat table. Or Shut Down to vent.` },
  { id: "rear-shot", when: (c) => c.cands?.find((x) => (x.action === "fire" || x.action === "aimed") && x.arc === "rear"), text: (c, x) => `${x.target} is showing you its back! Rear-arc hits carry extra Penetration, so they wound far more often.` },
  { id: "side-shot", when: (c) => c.cands?.find((x) => (x.action === "fire") && x.arc === "side"), text: (c, x) => `You have a flank on ${x.target}. Side hits beat front hits; rear hits beat both. Facing is everything.` },
  { id: "gun-spent", when: (c) => c.rig?.owner === c.side && c.rig?.loaded?.longRange === false, text: () => `Gun's dry. Reloading costs heat (d6 roll), or close in and use your melee weapon, which never needs reloading.` },
  { id: "engaged", when: (c) => c.rig?.owner === c.side && c.rig?.engagedWith != null, text: () => `Locked in melee! An engaged rig can't Move or Sprint until it Disengages (1 action). Ranged shots suffer while locked.` },
  { id: "out-of-actions", when: (c) => c.turn?.activeRigId === c.rig?.id && c.turn.actionsUsed >= c.turn.actionsMax && c.rig.owner === c.side, text: () => `Out of actions. End the activation and let the enemy move.` },
  { id: "hidden-prep", when: (c) => c.state.rigs.find((r) => r.owner !== c.side && r.preparation?.hidden), text: (c, r) => `${r.name} has a face-down reaction (🛡). Attack it and it may Brace, dodge, or shoot back. Sometimes it's worth hitting something else first.` },
  { id: "contested", when: (c) => c.contested, text: () => `A beacon is contested: both sides are in range, so nobody scores it. Clear it or out-last them.` },
  { id: "escalation", when: (c) => (c.state.game.beaconMultiplier || 1) > 1, text: (c) => `Beacons pay ×${c.state.game.beaconMultiplier} this round, so a late push can overturn an early lead. Don't coast.` },
  { id: "grit", when: (c) => (c.state.game.gritTokens?.[c.side] || 0) > 0, text: () => `You're behind, so HQ sends Grit tokens each round (1 at 2+ VP behind, 2 at 5+, 3 at 8+): a free face-down reaction that's Improved (tougher Brace, surer dodges, harder counter-hits), an upgrade to one you already placed, or keep it to reroll every missed shot on one attack. Kills while you're behind also pay a +2 VP bounty. Use it to break their hold.` },
  { id: "stagger", when: (c) => c.state.rigs.find((r) => r.owner === c.side && !r.destroyed && r.staggered), text: (c, r) => `${r.name} is Staggered: a shot rang its armour without doing damage. +1 heat, and −1 Aim on its next attack. Misses aren't wasted, they rattle the target.` },
  // Campaign contracts.
  { id: "extract-zone", when: (c) => c.state.campaign?.type === "breakthrough" && c.myTurn && c.state.rigs.find((r) => r.owner === c.side && !r.destroyed && !r.activated && inExitZone(r, c.state.campaign.exit)), text: (c, r) => `${r.name} is inside the extraction zone. Extract (1 action) lifts it off the table for good: it counts toward the goal and keeps its SP, but it can't fight again this battle.` },
  { id: "crates", when: (c) => c.state.campaign?.type === "salvage" && (c.state.game.objectives || []).some((o) => o.crate), text: () => `Salvage crates don't score like beacons: END a rig's activation within 2" of one and it hauls the crate away, +2 VP on the spot. The enemy grabs them too.` },
  { id: "reinforcements", when: (c) => c.state.campaign?.reinforcements?.some((rf) => rf.arrived), text: () => `Enemy reinforcements land in their corner at the start of the listed rounds (see the contract strip). Survive to the round limit: you don't have to win the brawl, just keep one rig standing.` },
  { id: "hurt", when: (c) => c.state.rigs.find((r) => r.owner === c.side && !r.destroyed && ["hull", "arms", "legs", "engine"].some((l) => r[l] && r[l].sp > 0 && r[l].sp <= r[l].max / 3)), text: (c, r) => `${r.name} is badly damaged. A location at 0 SP cripples it (arms drop weapons, legs slow it, engine stalls it). Repair costs an action, or pull it back.` },
];

export class Wires {
  constructor(root, match) {
    this.match = match; this.last = 0;
    this.box = el("div", { class: "wires" });
    root.append(this.box);
    // Re-check on a timer too: a modal or an animation can swallow the moment
    // the state changed.
    this.timer = setInterval(() => this.check(), 3000);
  }

  check() {
    if (!settings.get("wires")) return;
    const m = this.match, st = m.state;
    if (!st || !m.director.idle || Date.now() - this.last < 12000 || document.querySelector(".modal-back")) return;
    const rig = m.rig(m.selected) || m.activeRig;
    const turn = st.game.turn;
    let cands = null;
    try { if (rig && rig.owner === m.side && m.myTurn) cands = candidatesFor(m.previewRoom(rig), rig); } catch {}
    const myTargetId = st.game.priorityTargets?.[m.side];
    const contested = (st.game.objectives || []).some((o) => {
      const who = new Set(st.rigs.filter((r) => !r.destroyed && r.pos && controlsObjective(spatial(r), o)).map((r) => r.owner));
      return who.size === 2;
    });
    const ctx = { state: st, side: m.side, rig, turn, myTurn: m.myTurn, cands, meter: rig ? heatMeter(rig) : null, myTarget: st.rigs.find((r) => r.id === myTargetId), contested };
    for (const w of WIRES) {
      if (seen.has(w.id)) continue;
      let hit;
      try { hit = w.when(ctx); } catch { hit = null; }
      if (!hit) continue;
      this.show(w.text(ctx, hit));
      markSeen(w.id);
      this.last = Date.now();
      return;
    }
  }

  show(text) {
    sfx.bark();
    const card = el("div", { class: "wire" }, el("div", { class: "wire-h" }, "⚡ WIRE FROM HQ ⚡"), el("p", {}, text),
      el("button", { class: "btn ghost", onClick: () => card.remove() }, "Understood"));
    this.box.append(card);
    setTimeout(() => card.classList.add("out"), 14000);
    setTimeout(() => card.remove(), 14600);
  }

  destroy() { clearInterval(this.timer); this.box.remove(); }
}
