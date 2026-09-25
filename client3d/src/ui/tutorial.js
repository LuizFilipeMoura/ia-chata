// Training Grounds: one short lesson per mechanic, each in its own hand-built
// scenario room (shared/scenarios.js) against a practice dummy. A coach panel
// walks through the lesson one idea at a time, locks the game to what the step
// asks, spotlights the relevant HUD piece, and advances when you actually do it.
import { el, clear, fill } from "./dom.js";
import { heatTable } from "./hud.js";
import { exampleCard, woundInfo } from "./examples.js";

const res = (m) => m.state?.game?.resolutions || [];
const myAttack = (m, test = () => true) => res(m).some((r) => r.kind === "attack" && r.breakdown?.actor === "Copper" && test(r));
const arcOf = (r) => /(side|rear) arc/.exec(JSON.stringify(r.breakdown || {}))?.[1] || "front";
const vpA = (m) => m.state?.game?.sides?.find((s) => s.id === "a")?.vp || 0;
const picked = (m) => { const r = m.rig(m.selected); return r && r.owner === m.side && !r.activated; };

// The four components, illustrated: where each sits on the rig, how often the
// D12 lands there, and what losing it does (rules.md §7, §8).
const PARTS = [
  { k: "hull", n: "Hull", d12: "1-4", icon: "🛡", role: "The armoured body. Toughest part, hit most often.", zero: "−2 actions per turn and −1 Aim.", more: "Hit again at 0: the rig is destroyed." },
  { k: "arms", n: "Arms", d12: "5-7", icon: "🦾", role: "Carry both weapons.", zero: "A weapon is torn off and its ammo blows: 1 damage to Hull and 1 to Engine.", more: "Further hits spill into the Hull." },
  { k: "legs", n: "Legs", d12: "8-10", icon: "🦿", role: "Speed and turning.", zero: "Move −3\", turning costs double, no backing up.", more: "Hit again: immobilised for the game, 1 damage spills to Hull." },
  { k: "engine", n: "Engine", d12: "11-12", icon: "⚙", role: "The boiler. Least armoured, rarely hit.", zero: "Skips its next activation; heat can't drop below 3.", more: "Hit again at 0: the rig is destroyed." },
];
const partsChart = (focus) => el("div", { class: "parts" }, PARTS.filter((p) => !focus || focus.includes(p.k)).map((p) =>
  el("div", { class: `part p-${p.k}` },
    el("div", { class: "part-h" }, el("span", { class: "part-ic" }, p.icon), el("b", {}, p.n), el("span", { class: "part-d12", title: "D12 hit-location roll" }, `🎲 ${p.d12}`)),
    el("div", { class: "part-role" }, p.role),
    el("div", { class: "part-zero" }, el("i", {}, "At 0 SP: "), p.zero),
    el("div", { class: "part-more" }, p.more))));

// The attack pipeline at a glance: four rolls, each can stop the attack.
const pipeline = (on) => el("div", { class: "pipe" }, [
  ["1", "🎯", "To hit", "D6 per shot vs your Aim"],
  ["2", "🎲", "Location", "D12: which part"],
  ["3", "🔩", "Wound", "D10 per hit vs armour"],
  ["4", "💥", "Damage", "SP off that part"],
].map(([n, ic, t, d]) => el("div", { class: `pipe-s ${on === n ? "on" : ""}` }, el("span", { class: "pipe-n" }, n), el("span", { class: "pipe-ic" }, ic), el("b", {}, t), el("span", {}, d))));

const PICK = { title: "Select Copper", allow: { select: true }, text: "Click your rig on the table, or its card on the left. Selecting a rig shows its actions along the bottom.", highlight: ".hud-roster:not(.enemy)", done: picked };
const DONE = (text) => ({ title: "Lesson complete ✓", allow: null, text, next: true, last: true });

export const LESSONS = [
  { id: "move", icon: "🦿", title: "Move and Sprint", blurb: "Walk, run, and what each costs.",
    steps: [
      { title: "The table", text: "This is a quiet corner of the proving ground: just you (Copper) and a practice dummy far away. Pan with WASD or drag, rotate with Q/E, zoom with the wheel.", next: true },
      PICK,
      { title: "Actions and heat", text: "Each activation a rig gets 3 actions. Every button shows its cost: the 🔥 number is heat added to the boiler.", highlight: ".hud-actions", next: true },
      { title: "Move", allow: { select: true, acts: ["move"] }, text: "Press Move. The green ring is how far you can walk. Click inside it, toward the glowing beacon.", highlight: '[data-act="move"]', done: (m, ev) => ev.moved },
      { title: "Sprint", allow: { select: true, acts: ["sprint"] }, text: "Sprint goes further but costs 2 heat instead of 1. Press Sprint and dash on toward the beacon.", highlight: '[data-act="sprint"]', done: (m, ev) => ev.sprinted },
      DONE("Moving spends actions and stokes heat. Sprint when distance matters; walk when heat does."),
    ] },
  { id: "beacon", icon: "📡", title: "Claim a beacon", blurb: "How you actually score points.",
    steps: [
      { title: "Beacons win games", text: "The glowing beacon ahead is worth 2 victory points each round to whoever holds it alone. Most points after 10 rounds wins.", next: true },
      PICK,
      { title: "Stand on it", allow: { select: true, acts: ["move"] }, text: "Move so your rig is on the beacon's ring.", highlight: '[data-act="move"]', done: (m, ev) => ev.moved },
      { title: "End the activation", allow: { end: true }, text: "Press End activation. At the end of the round every beacon you hold alone pays out.", highlight: '[data-act="end"]', done: (m) => vpA(m) > 0, waitText: "Waiting for the round to end…" },
      { title: "Points!", text: "Your salvage counter went up (top right). An enemy on the same beacon cancels you out: nobody scores it until one of you leaves or is wrecked.", highlight: ".hud-top", next: true },
      DONE("Hold beacons, contest theirs. Kills matter because they stop the enemy scoring."),
    ] },
  { id: "anatomy", icon: "🩻", title: "Rig anatomy", blurb: "Hull, Arms, Legs, Engine: what breaks, and what then.",
    steps: [
      { title: "Four parts, four health bars", text: "A rig has no single health pool. It has four components, each with its own Structure Points (SP). Those are the four bars on every rig card: H, A, L, E.", highlight: ".hud-roster:not(.enemy) .rc-sp", next: true },
      { title: "Where a hit lands", text: "Every attack rolls one D12 for where the volley lands, unless it's an Aimed Shot. The Hull is hit most; the Engine least. Each part also has its own armour (Toughness): the Hull is hardest to wound, the Engine easiest.", extra: () => partsChart(), next: true },
      { title: "Losing a part", text: "When a part hits 0 SP it breaks, with a lasting effect. Hit a broken part again and it gets worse, and for Hull or Engine that means the rig is destroyed.", extra: () => partsChart(["hull", "engine"]), next: true },
      { title: "Limbs", text: "Arms and Legs don't kill a rig on their own, but they cripple it. Extra damage to a broken limb spills into the Hull.", extra: () => partsChart(["arms", "legs"]), next: true },
      { title: "Read the enemy", text: "Look at the dummy's card: its Engine bar (E) is almost empty. 1 SP left. Click the dummy for its full sheet any time.", highlight: ".hud-roster.enemy .rc-sp", next: true },
      PICK,
      { title: "Aim for the Engine", allow: { select: true, acts: ["aimed"] }, text: "Press Aimed Shot, click the dummy, and pick the Engine. Aimed Shots choose the location but aim worse (−2), so it may take a couple of tries.", highlight: '[data-act="aimed"]', done: (m) => (m.state?.rigs?.find((r) => r.name === "Dummy")?.engine?.sp ?? 1) <= 0 || res(m).filter((r) => r.kind === "attack" && r.breakdown?.actor === "Copper").length >= 3 },
      { title: "What happened?", text: "Hover the attack in the Combat log for the rolls. If the Engine hit 0, the dummy now skips its next activation. One more Engine hit would destroy it.", highlight: ".clog", next: true },
      DONE("Focus fire on a weak part. Engine and Hull kill; Arms and Legs cripple. Protect your own weak spots."),
    ] },
  { id: "attackrules", scenario: "attackdemo", icon: "📐", title: "How an attack works", blurb: "To hit, location, wound, damage. With real examples.",
    steps: [
      { title: "Four rolls", text: "Every attack runs the same four steps. Any of them can stop it. The next pages show each one, with real results from the rules engine.", extra: () => pipeline(), next: true },
      { title: "1. To hit", text: "Roll one D6 per shot (the weapon's Shots stat). Each die that meets your Aim target hits; a natural 6 always hits. Aim gets worse off the weapon's sweet spot, behind cover, or on an Aimed Shot.", extra: () => [pipeline("1"), exampleCard("miss", "A sniper fired point-blank, far off its sweet spot: the one die misses. Nothing else happens.")], next: true },
      { title: "2. Location", text: "One D12 decides which part the whole volley strikes: Hull 1-4, Arms 5-7, Legs 8-10, Engine 11-12. That part's armour (Toughness) is what you must beat next.", extra: () => pipeline("2"), next: true },
      { title: "3. Wound", text: "Each hit rolls a D10. It wounds on 6 + Toughness − Penetration or more. Heavy armour and a weak gun mean a high target number.", extra: () => [pipeline("3"), exampleCard("bounce", (b) => `A Rivet Gun (Pen 3, −1 on a light rig) into a medium's front. ${woundInfo(b)}. Hits land, but every wound roll fails: no damage.`)], next: true },
      { title: "Penetration is king", text: "Penetration lowers the wound target: each point is +10%. A flank adds +2, the rear +3. Toughness raises it. The target never goes below 2 or above 10.", extra: () => exampleCard("wound", (b) => `Same gun into the ${b.location}. ${woundInfo(b)}. A few dice make it, and only those deal damage.`), next: true },
      { title: "Lucky dice", text: "A natural 10 on the wound die ALWAYS wounds, and a natural 1 never does. No armour is immune, and no gun is guaranteed.", extra: () => exampleCard("lucky", (b) => `${woundInfo(b)}. Everything else fails, but a natural 10 punches through anyway.`), next: true },
      { title: "4. Damage", text: "Each wound takes the weapon's Damage stat off that part's SP. A strong gun from the rear barely needs luck.", extra: () => [pipeline("4"), exampleCard("flank", (b) => `An Autocannon into a medium's rear (+3 Pen). ${woundInfo(b)}: almost every hit wounds, each for its full Damage.`)], next: true },
      { title: "Breaking a part", text: "Take a part to 0 and it breaks, with the effects you saw in Rig anatomy.", extra: () => exampleCard("breaks", "An Aimed Shot at an Engine on 1 SP: it breaks, and that rig skips its next activation."), next: true },
      DONE("Aim → location → wound → damage. Hover (or click) any Combat log line in a match to see all four for real. Next: take the shot yourself."),
    ] },
  { id: "fire", icon: "🎯", title: "Open fire", blurb: "Shooting, dice and damage.",
    steps: [
      { title: "A sitting duck", text: "The dummy is 12 inches ahead, right at your Autocannon's sweet spot, and facing away from you.", next: true },
      PICK,
      { title: "Fire", allow: { select: true, acts: ["fire"] }, text: "Press Fire, then click the dummy. You can only target what's inside your front 90° (the green wedge).", highlight: '[data-act="fire"]', done: (m) => myAttack(m) },
      { title: "Read the result", text: "Hover the newest line in the Combat log: every die, the to-hit target and why, the hit location and the damage are all there.", highlight: ".clog", next: true },
      { title: "Aimed Shot", allow: { select: true, acts: ["aimed"] }, text: "Aimed Shot fires fewer dice but lets you pick the hit location. Aim for the Engine: at 0 the rig skips its next turn.", highlight: '[data-act="aimed"]', done: (m) => res(m).filter((r) => r.kind === "attack" && r.breakdown?.actor === "Copper").length >= 2, skippable: true },
      DONE("Distance matters: each gun has a sweet spot. The Combat log always explains the roll."),
    ] },
  { id: "arcs", icon: "↪", title: "Arcs and flanking", blurb: "Face your target, then hit it where it's soft.",
    steps: [
      { title: "Your front arc", text: "A rig can only attack what's in its front 90°: the green wedge in front of it. Copper is looking away, so the dummy is outside the wedge. You can't shoot it yet.", next: true },
      PICK,
      { title: "Their armour faces forward", text: "The dummy's front is its toughest side. Hitting its side adds +2 Penetration, its rear +3. Hover the dummy to see its arcs drawn on the table.", next: true },
      { title: "Walk around and turn", allow: { select: true, acts: ["move", "sprint"] }, text: "Move (or Sprint) past the dummy toward its back. A move turns you the way you walk; Shift+wheel adjusts your final facing. End up facing the dummy.", highlight: '[data-act="move"], [data-act="sprint"]', done: (m, ev) => ev.moved },
      { title: "Hit it where it's soft", allow: { select: true, acts: ["fire", "move", "sprint"] }, text: "Now Fire. If the dummy isn't offered as a target, it's still outside your wedge: move again. A side or rear bonus in the log means you nailed it.", highlight: '[data-act="fire"]', done: (m) => myAttack(m, (r) => arcOf(r) !== "front") },
      DONE("Facing works both ways: turn to bring enemies into your wedge, and keep your own front toward them."),
    ] },
  { id: "melee", icon: "🗡", title: "Melee", blurb: "Brawling and getting locked in.",
    steps: [
      { title: "Too close to shoot straight", text: "The dummy is right in your face: inside your Claw's reach (the orange ring).", next: true },
      PICK,
      { title: "Strike", allow: { select: true, acts: ["fire"] }, text: "Press Fire and click the dummy. In reach, Fire swings your melee weapon instead of the gun.", highlight: '[data-act="fire"]', done: (m) => myAttack(m, (r) => r.breakdown?.weapon === "Claw") },
      { title: "Engaged", text: "Rigs in melee are locked together: to walk away you must spend an action to Disengage. Brawlers love that; snipers hate it.", next: true },
      DONE("Melee skips range bands and line of sight. Charge the shooters, keep your own gunners clear."),
    ] },
  { id: "heat", icon: "🔥", title: "Heat and Shut Down", blurb: "Push too hard and the boiler bites.",
    steps: [
      { title: "Already running hot", text: "Copper starts at 5 heat; a light rig's capacity is 6. The brass dial on its card shows it.", highlight: ".hud-roster:not(.enemy)", next: true },
      PICK,
      { title: "Push it", allow: { select: true, acts: ["fire"] }, text: "Fire at the dummy. That's 1 more heat: right at the limit.", highlight: '[data-act="fire"]', done: (m) => myAttack(m) },
      { title: "Over the edge", allow: { select: true, acts: ["fire"] }, text: "Fire again. Now you're past capacity. Watch the End button: it warns you of the odds.", highlight: '[data-act="fire"]', done: (m) => res(m).filter((r) => r.kind === "attack" && r.breakdown?.actor === "Copper").length >= 2 },
      { title: "The overheat roll", text: "End a turn past capacity and you roll: the further over, the worse. Results run from nothing, to damage, to a wrecked engine.", extra: () => heatTable(), next: true },
      { title: "Shut Down", allow: { acts: ["shutdown"] }, text: "Shut Down ends the activation and vents heat instead of risking the roll. Press it.", highlight: '[data-act="shutdown"]', done: (m, ev) => ev.ended },
      DONE("Every action heats you. A third action is powerful but risky; Shut Down when you've overdone it."),
    ] },
  { id: "equipment", icon: "⚙", title: "Equipment", blurb: "Each rig's special gadget.",
    steps: [
      { title: "A new rig", text: "This time you pilot a medium sniper fitted with a Targeting Computer. Equipment gives an always-on bonus plus one special action.", next: true },
      PICK,
      { title: "Inspect it", allow: { select: true }, text: "Click Copper on the table to open its full sheet: weapons, upgrades, and equipment with both effects.", highlight: ".hud-roster:not(.enemy)", next: true },
      { title: "Lock Sight", allow: { select: true, acts: ["locksight"] }, text: "Press Lock Sight (the equipment action) to steady your aim for the next shot.", highlight: '[data-act="locksight"]', done: (m, ev) => ev.equip },
      { title: "Now shoot", allow: { select: true, acts: ["fire"] }, text: "Fire at the dummy and check the log: the lock shows up as an accuracy bonus.", highlight: '[data-act="fire"]', done: (m) => myAttack(m) },
      DONE("Every chassis carries a different gadget: armour, vents, jump jets, repairs, smoke. Learn yours."),
    ] },
  { id: "reactions", icon: "🛡", title: "Reactions", blurb: "The Answer token and preparing for hits.",
    steps: [
      { title: "They move first", text: "A raider is about to open fire on you. Whoever acts second each round gets a free Answer token: a face-down reaction placed before the enemy moves.", next: true },
      { title: "Place your Answer", allow: {}, text: "Pick Copper and a reaction in the popup. Brace is the safe choice: it softens the next hit.", done: (m) => !m.state?.game?.pendingAnswer },
      { title: "Incoming!", text: "Watch the raider's turn. When it attacks, your reaction triggers.", done: (m) => res(m).some((r) => r.kind === "attack" && r.breakdown?.actor === "Raider"), waitText: "The raider is lining up…", next: false },
      { title: "Prepare", text: "On your own turn, Prepare (1 heat) places another reaction: Brace, Evasive, Return Fire and more. Hover each card to see when it triggers.", next: true },
      DONE("Reactions are hidden until they trigger: keep your opponent guessing."),
    ] },
];

export class Coach {
  constructor(root, match, lesson, { onNext, onMenu } = {}) {
    this.root = root; this.match = match; this.i = 0; this.lesson = lesson; this.steps = lesson.steps; this.ev = {}; this.onNext = onNext; this.onMenu = onMenu;
    this.panel = el("div", { class: "coach" });
    // Spotlight: a grey veil over everything except the coach and the
    // highlighted elements (cut out as holes). Clicks pass through; the gate
    // already blocks anything the step doesn't ask for.
    this.veil = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    this.veil.setAttribute("class", "coach-veil");
    this.veil.style.pointerEvents = "none";
    root.append(this.veil, this.panel);
    const tick = () => { this.drawVeil(); this.raf = requestAnimationFrame(tick); };
    tick();
    const on = (type, fn) => match.events.addEventListener(type, (e) => { fn(e.detail); this.check(); });
    on("command", ({ verb, attrs }) => {
      if (verb === "action" && (attrs.action === "move" || attrs.action === "sprint")) this.ev.moved = true;
      if (verb === "action" && attrs.action === "sprint") this.ev.sprinted = true;
      if (verb === "action" && ["harden", "purge", "jumpjets", "overclock", "emergencypatch", "heatpurgewave", "locksight", "popsmoke"].includes(attrs.action)) this.ev.equip = true;
      if (verb === "action" && (attrs.action === "fire" || attrs.action === "aimed")) this.ev.attacked = true;
      if (verb === "endactivation" || attrs?.action === "shutdown") this.ev.ended = true;
    });
    on("advisor", () => { this.ev.advised = true; });
    on("state", () => {});
    on("select", () => {});
    this.camTimer = setInterval(() => { if (match.world.moved) { this.ev.camera = true; this.check(); } }, 400);
    this.render();
  }

  destroy() { this.match.gate = null; this.match.renderActions?.(); clearInterval(this.camTimer); clearInterval(this.hlTimer); clearTimeout(this.skipTimer); cancelAnimationFrame(this.raf); this.veil.remove(); this.panel.remove(); this.unhighlight(); }

  check() {
    const s = this.steps[this.i];
    if (s?.done && s.done(this.match, this.ev)) this.advance();
    else this.render();
  }

  // Things you already did stay done (this.ev is cumulative): a step whose goal
  // you met earlier shows a quick "✓ already done" and moves on by itself.
  advance() {
    if (this.i >= this.steps.length - 1) return;
    this.i++;
    const s = this.steps[this.i];
    if (s.done && !s.next && s.done(this.match, this.ev)) {
      this.render(true);
      clearTimeout(this.skipTimer);
      this.skipTimer = setTimeout(() => this.advance(), 1400);
      return;
    }
    this.render();
    setTimeout(() => this.check(), 50);
  }

  // Park the coach next to what it's pointing at (above, below, then beside),
  // clamped on screen. No highlight: its default spot top-left.
  placePanel(holes) {
    const p = this.panel, pw = p.offsetWidth, ph = p.offsetHeight, m = 16;
    let x, y;
    if (!holes.length) { p.style.left = ""; p.style.right = ""; p.style.bottom = ""; p.style.top = `${Math.max(8, Math.min(120, innerHeight - ph - 8))}px`; return; }
    const r = holes.reduce((a, b) => ({ left: Math.min(a.left, b.left), top: Math.min(a.top, b.top), right: Math.max(a.right, b.right), bottom: Math.max(a.bottom, b.bottom) }));
    const cx = (r.left + r.right) / 2;
    if (r.top - ph - m > 8) { x = cx - pw / 2; y = r.top - ph - m; }
    else if (r.bottom + ph + m < innerHeight - 8) { x = cx - pw / 2; y = r.bottom + m; }
    else if (r.right + pw + m < innerWidth - 8) { x = r.right + m; y = r.top; }
    else { x = r.left - pw - m; y = r.top; }
    x = Math.max(8, Math.min(innerWidth - pw - 8, x));
    y = Math.max(8, Math.min(innerHeight - ph - 8, y));
    p.style.left = `${Math.round(x)}px`; p.style.top = `${Math.round(y)}px`; p.style.right = "auto"; p.style.bottom = "auto";
  }

  drawVeil() {
    const s = this.steps[this.i] || {};
    // Steps played on the board keep it readable: lighter veil.
    const onBoard = s.allow && (s.allow.select || s.allow.acts);
    const lit = [...document.querySelectorAll(".coach-hl")];
    const holes = lit.map((n) => n.getBoundingClientRect()).filter((r) => r.width && r.height);
    const w = innerWidth, h = innerHeight, pad = 6;
    const path = `M0 0H${w}V${h}H0Z` + holes.map((r) => `M${r.left - pad} ${r.top - pad}v${r.height + pad * 2}h${r.width + pad * 2}v${-(r.height + pad * 2)}Z`).join("");
    // A button inside a panel (the action bar): sit beside the whole panel,
    // not on top of its header.
    const box = lit.map((n) => n.closest(".hud-actions, .hud-roster")).find(Boolean);
    this.placePanel(box ? [box.getBoundingClientRect()] : holes);
    const key = `${path}|${onBoard}`;
    if (key === this.veilKey) return;
    this.veilKey = key;
    this.veil.setAttribute("viewBox", `0 0 ${w} ${h}`);
    this.veil.innerHTML = `<path pointer-events="none" fill-rule="evenodd" d="${path}" fill="rgba(12,10,8,${onBoard ? 0.35 : 0.62})"/>`;
  }

  unhighlight() { document.querySelectorAll(".coach-hl").forEach((n) => n.classList.remove("coach-hl")); }

  render(already = false) {
    const s = this.steps[this.i];
    // Lock the game to what this step teaches (null = free play). Steps that
    // only explain allow nothing but the camera.
    this.match.gate = "allow" in s ? s.allow : {};
    this.match.renderActions?.();
    if (s.last) try { const d = JSON.parse(localStorage.getItem("oi3d-lessons") || "[]"); if (!d.includes(this.lesson.id)) localStorage.setItem("oi3d-lessons", JSON.stringify([...d, this.lesson.id])); } catch {}
    this.unhighlight();
    if (s.highlight) document.querySelectorAll(s.highlight).forEach((n) => n.classList.add("coach-hl"));
    const waiting = s.done && !s.next && s.waitText && !s.done(this.match, this.ev);
    fill(this.panel, 
      el("div", { class: "coach-h" }, el("span", { class: "step" }, `${this.i + 1}/${this.steps.length}`), el("b", {}, `${this.lesson.icon} ${s.title}`), el("button", { class: "x", title: "Close tutorial", onClick: () => this.destroy() }, "✕")),
      el("p", {}, s.text),
      s.extra ? s.extra() : null,
      waiting ? el("p", { class: "muted" }, s.waitText) : null,
      already ? el("p", { class: "done-tick" }, "✓ Already done. Nice!") : null,
      el("div", { class: "coach-a" },
        this.i > 0 ? el("button", { class: "btn ghost", onClick: () => { this.i--; this.render(); } }, "‹ Back") : null,
        s.last ? el("div", { class: "coach-end" },
          el("button", { class: "btn ghost", onClick: () => this.onMenu?.() }, "All lessons"),
          this.onNext ? el("button", { class: "btn primary", onClick: () => this.onNext() }, "Next lesson ›") : el("button", { class: "btn primary", onClick: () => this.onMenu?.() }, "Done")) :
        s.next || s.skippable ? el("button", { class: "btn primary", onClick: () => this.advance() }, s.skippable ? "Skip ›" : "Next ›") : el("span", { class: "muted" }, "Do it to continue…")),
    );
    // Keep the highlight on elements that re-render (the action bar rebuilds).
    clearInterval(this.hlTimer);
    if (s.highlight) this.hlTimer = setInterval(() => document.querySelectorAll(s.highlight).forEach((n) => n.classList.add("coach-hl")), 500);
  }
}
