// End-of-battle debrief: who won and why, the VP race round by round, each
// rig's damage / kills, the MVP, the best shot and the turning point, plus a
// button to watch the whole battle back in the replay theatre.
import { el, fill } from "./dom.js";
import { icon } from "./icons.js";
import { outcomeWords } from "./mission.js";
import { pulpCover } from "./moments-logic.js";
import { posterCanvas, rigSilhouette, battlePlace, battleFactions } from "./posters.js";
import { PROPAGANDA } from "../propaganda.js";

// Validated chart pair on the dark panel (dataviz validator: lightness, CVD,
// contrast all pass). Identity is also carried by the legend + end labels.
const COL = { a: "#2fa191", b: "#e0533d" };

// Collects the battle's story from the log entries the Director plays.
export class MatchStats {
  constructor() {
    this.rigs = new Map();   // name → { name, owner, dmg, kills, attacks, staggers, overheats }
    this.best = null;        // { actor, target, weapon, sp, round }
    this.lastHitBy = new Map();
    this.vp = [];            // [{ round, a, b }]
  }

  row(name, owner) {
    if (!this.rigs.has(name)) this.rigs.set(name, { name, owner, dmg: 0, kills: 0, attacks: 0, staggers: 0, overheats: 0 });
    const r = this.rigs.get(name);
    if (owner && !r.owner) r.owner = owner;
    return r;
  }

  // ownerOf(name) → "a" | "b"
  add(l, round, ownerOf) {
    const b = l.breakdown;
    if (l.kind === "attack" && b) {
      const r = this.row(b.actor, ownerOf(b.actor));
      r.attacks++; r.dmg += b.sp || 0;
      if (l.stagger) r.staggers++;
      if (b.sp) this.lastHitBy.set(b.target, b.actor);
      if (b.sp && (!this.best || b.sp > this.best.sp)) this.best = { actor: b.actor, target: b.target, weapon: b.weapon, sp: b.sp, round };
    } else if (l.kind === "destruction") {
      const victim = l.victimName || (/^(.+?) destroyed/.exec(l.summary || "") || [])[1];
      const killer = victim && this.lastHitBy.get(victim);
      if (killer) this.row(killer, ownerOf(killer)).kills++;
    } else if (l.kind === "overheat") {
      const who = (/^(.*?):/.exec(l.summary || "") || [])[1];
      if (who) this.row(who, ownerOf(who)).overheats++;
    }
  }

  // Every state: note the VP (the chart takes the last value per round).
  noteVp(round, sides) {
    const a = sides.find((s) => s.id === "a")?.vp ?? 0, b = sides.find((s) => s.id === "b")?.vp ?? 0;
    const last = this.vp[this.vp.length - 1];
    if (last?.round === round) { last.a = a; last.b = b; } else this.vp.push({ round, a, b });
  }

  // The round the eventual winner took the lead for good.
  turningPoint(winner) {
    if (!winner) return null;
    let at = null;
    for (const p of this.vp) {
      const lead = p.a > p.b ? "a" : p.b > p.a ? "b" : null;
      if (lead === winner) { if (at == null) at = p.round; } else at = null;
    }
    return at;
  }

  mvp() {
    return [...this.rigs.values()].sort((x, y) => (y.dmg + y.kills * 6) - (x.dmg + x.kills * 6))[0] || null;
  }
}

// VP race: one line per side, round on x, VP on y. Hover a round for values.
function vpChart(points, names) {
  if (points.length < 2) return null;
  const W = 520, H = 170, L = 34, R = 56, T = 12, B = 26;
  const maxR = Math.max(...points.map((p) => p.round)), minR = Math.min(...points.map((p) => p.round));
  const maxV = Math.max(4, ...points.flatMap((p) => [p.a, p.b]));
  const x = (r) => L + ((r - minR) / Math.max(1, maxR - minR)) * (W - L - R);
  const y = (v) => T + (1 - v / maxV) * (H - T - B);
  const line = (k) => points.map((p, i) => `${i ? "L" : "M"}${x(p.round).toFixed(1)},${y(p[k]).toFixed(1)}`).join(" ");
  const ticks = [0, Math.round(maxV / 2), maxV];
  const last = points[points.length - 1];
  // End labels: nudge apart when the two lines finish close together.
  let ya = y(last.a), yb = y(last.b);
  if (Math.abs(ya - yb) < 16) { const mid = (ya + yb) / 2; ya = mid + (last.a >= last.b ? -8 : 8); yb = mid + (last.b > last.a ? -8 : 8); }
  const wrap = el("div", { class: "vp-chart" });
  wrap.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Victory points by round">
    ${ticks.map((v) => `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="rgba(233,220,192,.12)"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end" font-size="12" fill="#a8997a">${v}</text>`).join("")}
    ${points.map((p) => `<text x="${x(p.round)}" y="${H - 6}" text-anchor="middle" font-size="12" fill="#a8997a">${p.round}</text>`).join("")}
    <path d="${line("a")}" fill="none" stroke="${COL.a}" stroke-width="2" stroke-linejoin="round"/>
    <path d="${line("b")}" fill="none" stroke="${COL.b}" stroke-width="2" stroke-linejoin="round"/>
    ${points.map((p) => `<circle cx="${x(p.round)}" cy="${y(p.a)}" r="4" fill="${COL.a}" stroke="#1c1710" stroke-width="2"/><circle cx="${x(p.round)}" cy="${y(p.b)}" r="4" fill="${COL.b}" stroke="#1c1710" stroke-width="2"/>`).join("")}
    <text x="${W - R + 8}" y="${ya + 4}" font-size="12" fill="#e9dcc0">${names.a} ${last.a}</text>
    <text x="${W - R + 8}" y="${yb + 4}" font-size="12" fill="#e9dcc0">${names.b} ${last.b}</text>
    ${points.map((p) => `<rect x="${x(p.round) - 14}" y="${T}" width="28" height="${H - T - B}" fill="transparent"><title>Round ${p.round}: ${names.a} ${p.a} · ${names.b} ${p.b}</title></rect>`).join("")}
  </svg>`;
  return el("div", {},
    el("div", { class: "vp-legend" }, el("span", {}, el("i", { style: { background: COL.a } }), names.a), el("span", {}, el("i", { style: { background: COL.b } }), names.b)),
    wrap);
}

// The alternative recap: a lurid pulp magazine cover built from the battle's
// real numbers (MVP, best shot, final VP, the battlefield's name).
export function pulpCoverEl(stats, { game, side }) {
  const winner = game.outcome?.winner ?? null;
  const mvp = stats.mvp();
  const c = pulpCover({ mvp, best: stats.best, winner, side, place: battlePlace(), round: game.round, vp: game.sides.map((s) => s.vp), seed: stats.vp.length + (mvp?.dmg || 0) });
  const heroClass = mvp?.owner === side ? "hero" : "villain";
  return el("div", { class: `pulp t-${c.tone}`, role: "img", "aria-label": `${c.masthead}: ${c.headline}` },
    el("div", { class: "pulp-top" }, el("span", {}, c.issue), el("b", { class: "pulp-mast" }, c.masthead), el("span", { class: "pulp-price" }, c.price)),
    el("div", { class: "pulp-art" },
      el("div", { class: "pulp-burst", "aria-hidden": "true" }),
      el("div", { class: `pulp-rig ${heroClass}`, html: rigSilhouette("medium", mvp?.name || "x") }),
      el("div", { class: "pulp-rig far", html: rigSilhouette("light", stats.best?.target || "y") })),
    el("div", { class: "pulp-head" }, c.headline),
    el("div", { class: "pulp-sub" }, c.sub),
    el("div", { class: "pulp-teaser" }, c.teaser));
}

// Victory: our faction's poster, fresh. Defeat: theirs, pasted over the wall.
function victoryPoster(won) {
  const { mine, theirs } = battleFactions();
  const id = won ? mine : theirs;
  const p = PROPAGANDA[id];
  return el("div", { class: "db-poster", "aria-hidden": "true" }, posterCanvas(id, 150, 225, { slogan: p?.slogans[1] || null, seed: 5, aged: won ? 0.2 : 0.8 }));
}

// The debrief body. side: the viewer's side ("a"/"b").
export function debrief(stats, { game, side, reason }) {
  const winner = game.outcome?.winner ?? null;
  const names = { a: side === "a" ? "You" : "Enemy", b: side === "b" ? "You" : "Enemy" };
  const vpTxt = game.sides.map((s) => `${names[s.id]} ${s.vp}`).join(" – ");
  const tp = stats.turningPoint(winner);
  const mvp = stats.mvp();
  const rows = [...stats.rigs.values()].sort((x, y) => (x.owner === side ? -1 : 1) - (y.owner === side ? -1 : 1) || y.dmg - x.dmg);
  // Two ways to read the ending: the dispatch (numbers) or the pulp cover.
  const report = el("div", { class: "db-report" });
  const cover = el("div", { class: "db-cover", hidden: true }, pulpCoverEl(stats, { game, side }));
  const tab = (label, show) => el("button", { class: "btn ghost db-tab", onClick: (e) => {
    report.hidden = show !== report; cover.hidden = show !== cover;
    e.target.parentNode.querySelectorAll(".db-tab").forEach((b) => b.classList.toggle("on", b === e.target));
  } }, label);
  const tabs = el("div", { class: "db-tabs" }, tab("Dispatch", report), tab("Pulp cover", cover));
  tabs.firstChild.classList.add("on");
  fill(report,
    victoryPoster(winner === side),
    el("p", { class: "db-lead" }, `${outcomeWords({ ...game.outcome, reason: reason ?? game.outcome?.reason }, null, side) || "Decided on victory points"} · ${vpTxt} · round ${game.round}`),
    el("div", { class: "db-facts" },
      mvp ? el("div", { class: "db-fact" }, icon("star"), el("b", {}, "MVP "), el("span", { class: mvp.owner === "b" ? "c-b" : "c-a" }, mvp.name), ` · ${mvp.dmg} SP dealt${mvp.kills ? `, ${mvp.kills} kill${mvp.kills > 1 ? "s" : ""}` : ""}`) : null,
      stats.best ? el("div", { class: "db-fact" }, icon("dmg"), el("b", {}, "Best shot "), `${stats.best.actor} → ${stats.best.target}, ${stats.best.weapon}: ${stats.best.sp} SP (round ${stats.best.round})`) : null,
      tp ? el("div", { class: "db-fact" }, icon("beacon"), el("b", {}, "Turning point "), `${winner === side ? "You" : "The enemy"} took the lead for good in round ${tp}`) : null),
    vpChart(stats.vp, names),
    rows.length ? el("table", { class: "db-table" },
      el("tr", {}, ["Rig", "SP dealt", "Kills", "Attacks", "Staggers", "Overheats"].map((h) => el("th", {}, h))),
      rows.map((r) => el("tr", {}, el("td", { class: r.owner === "b" ? "c-b" : "c-a" }, r.name), el("td", {}, String(r.dmg)), el("td", {}, String(r.kills)), el("td", {}, String(r.attacks)), el("td", {}, String(r.staggers)), el("td", {}, String(r.overheats))))) : null);
  return el("div", { class: "debrief" }, tabs, report, cover);
}
