// Balance Lab: run the genetic meta-search on the server, watch fitness climb,
// read per-chassis / per-upgrade win rates (the balance report), replay each
// generation's feature match in 3D, calibrate the difficulty tiers, and adopt a
// run as the Hard bot's playbook.
import { el, clear, fill, toast } from "./dom.js";
import { api } from "../api.js";
import { CHASSIS, WEAPON_UPGRADES, EQUIPMENT } from "/shared/game-state.js";
import { EQUIPMENT_UPGRADES } from "/shared/rules.js";

const upgradeName = (id) => {
  for (const list of [...Object.values(WEAPON_UPGRADES), ...Object.values(EQUIPMENT_UPGRADES)]) {
    const u = list.find((x) => x.id === id); if (u) return `${u.name} (${u.nature})`;
  }
  return id;
};
const label = (kind, id) => kind === "comp" ? id.replace("M", " medium + ").replace("L", " light") : kind === "table" ? id : kind.startsWith("chassis") ? (CHASSIS.find((c) => c.id === id)?.name ?? id) + " · " + (CHASSIS.find((c) => c.id === id)?.label ?? "")
  : kind === "equip" ? (EQUIPMENT[id]?.label ?? id) : upgradeName(id);
const KIND_TITLE = {
  comp: "Squad makeup", table: "Table size", chassis: "Chassis (all tables)",
  "chassis@standard": "Chassis · Standard 54×36", "chassis@skirmish": "Chassis · Skirmish 42×28",
  lr: "Long-range upgrades", melee: "Melee upgrades", equip: "Equipment", equipUp: "Equipment mods",
};

function chart(canvas, history) {
  const g = canvas.getContext("2d");
  const W = canvas.width = canvas.clientWidth * devicePixelRatio, H = canvas.height = canvas.clientHeight * devicePixelRatio;
  g.clearRect(0, 0, W, H);
  if (!history.length) return;
  const max = Math.max(1.2, ...history.map((h) => h.best));
  const x = (i) => 30 + (i / Math.max(1, history.length - 1)) * (W - 50);
  const y = (v) => H - 20 - (v / max) * (H - 40);
  g.strokeStyle = "rgba(255,255,255,0.15)"; g.beginPath(); g.moveTo(30, y(0.5)); g.lineTo(W - 20, y(0.5)); g.stroke();
  g.fillStyle = "rgba(255,255,255,0.6)"; g.font = `${12 * devicePixelRatio}px sans-serif`; g.fillText("50%", 2, y(0.5) + 4);
  for (const [key, col] of [["mean", "#7fb3ff"], ["best", "#ffd35a"]]) {
    g.strokeStyle = col; g.lineWidth = 2 * devicePixelRatio; g.beginPath();
    history.forEach((h, i) => (i ? g.lineTo(x(i), y(h[key])) : g.moveTo(x(i), y(h[key]))));
    g.stroke();
  }
}

export function labScreen(root, { onBack, onLibrary }) {
  let job = null, timer = null;
  const params = { population: 16, generations: 6, gamesPer: 4, mutationRate: 0.25, fresh: false };
  const statsEl = el("div", { class: "lab-stats" });
  const replaysEl = el("div", { class: "lab-replays" });
  const statusEl = el("div", { class: "lab-status" });
  const canvas = el("canvas", { class: "lab-chart" });
  const calEl = el("div", { class: "lab-cal" });
  const bestEl = el("div", { class: "lab-best" });

  const field = (k, lbl, step = 1) => el("label", {}, lbl, el("input", { type: "number", value: params[k], step, onInput: (e) => { params[k] = Number(e.target.value); } }));

  const poll = async () => {
    if (!job) return;
    try { job = await api.sim.job(job.id); } catch { return; }
    draw();
    if (job.status === "running") timer = setTimeout(poll, 2000);
  };

  const pickerEl = el("div", { class: "lab-picker" });
  // Rules fingerprint + gene pool status.
  const metaEl = el("div", { class: "lab-meta" });
  api.sim.meta().then((m) => {
    fill(metaEl,
      m.stale ? el("div", { class: "warn-banner" }, `⚠ The rules changed since the Hard bot's meta was evolved (meta ${m.meta.rulesHash} → rules ${m.rulesHash}). Run an evolution and adopt it to re-tune.`) : null,
      el("span", { class: "muted small" }, `Rules ${m.rulesHash} · gene pool: ${m.genePool} genomes. New runs continue from them (tick "Fresh start" to ignore).`));
  }).catch(() => {});
  let allJobs = [];
  const renderPicker = () => {
    const ga = allJobs.filter((j) => j.kind === "ga");
    fill(pickerEl, ga.length ? el("label", { class: "muted" }, "Run: ", el("select", { onChange: async (e) => { job = await api.sim.job(e.target.value); clearTimeout(timer); draw(); if (job.status === "running") poll(); } },
      ga.slice().reverse().map((j) => el("option", { value: j.id, selected: job?.id === j.id }, `${new Date(j.startedAt).toLocaleString()} · ${j.params.population}×${j.params.generations} · ${j.status}`)))) : null);
  };
  const draw = () => {
    renderPicker();
    statusEl.textContent = job ? `Run ${job.id}${job.seeded ? ` (seeded ${job.seeded} from the gene pool)` : ""}: ${job.status} · generation ${job.generation + 1}/${job.params.generations}${job.games ? ` · ${job.done}/${job.games} simulated games` : ""}${job.error ? " · " + job.error : ""}` : "No run yet.";
    chart(canvas, job?.history || []);
    clear(statsEl);
    const byKind = {};
    for (const s of job?.stats || []) (byKind[s.kind] ||= []).push(s);
    for (const kind of ["comp", "table", "chassis", "chassis@standard", "chassis@skirmish", "lr", "melee", "equip", "equipUp"]) {
      const rows = (byKind[kind] || []).sort((a, b) => b.winRate - a.winRate);
      if (!rows.length) continue;
      statsEl.append(el("div", { class: "stat-block" }, el("h3", {}, KIND_TITLE[kind]),
        el("table", {}, el("tr", {}, el("th", {}, "Pick"), el("th", {}, "Win%"), el("th", {}, "Games"), el("th", {}, "Dmg/g")),
          rows.map((r) => el("tr", { class: r.winRate > 0.6 ? "hot" : r.winRate < 0.4 ? "cold" : "" },
            el("td", {}, label(kind, r.id)),
            // Bar = win rate; the bracket = 95% confidence range. A range that
            // crosses 50% hasn't proven anything yet, play more games.
            el("td", { title: r.ciLow != null ? `95% range ${(r.ciLow * 100).toFixed(0)}–${(r.ciHigh * 100).toFixed(0)}%` : "" },
              el("div", { class: `wr ${r.ciLow > 0.5 ? "sig-hi" : r.ciHigh < 0.5 ? "sig-lo" : ""}` },
                el("i", { style: { width: `${r.winRate * 100}%` } }),
                r.ciLow != null ? el("b", { class: "ci", style: { left: `${r.ciLow * 100}%`, width: `${(r.ciHigh - r.ciLow) * 100}%` } }) : null,
                el("span", {}, `${(r.winRate * 100).toFixed(0)}%${r.ciLow != null ? ` ±${(((r.ciHigh - r.ciLow) / 2) * 100).toFixed(0)}` : ""}`))),
            el("td", {}, String(r.games)), el("td", {}, r.avgDmg.toFixed(1)))))));
    }
    // Every match of the run is a saved simulated game, browse them.
    fill(replaysEl, el("h3", {}, "This run's games"),
      job?.id && job.id !== "saved" ? [
        el("button", { class: "btn primary", onClick: () => onLibrary({ job: job.id }) }, `▶ All ${job.done ?? job.games ?? ""} simulated games`),
        el("div", { class: "gen-links" }, (job.history || []).map((h) => el("button", { class: "btn ghost", title: `best ${h.best.toFixed(2)} · mean ${h.mean.toFixed(2)}`, onClick: () => onLibrary({ job: job.id, generation: h.generation }) }, `Gen ${h.generation + 1}`))),
      ] : el("p", { class: "muted small" }, "Run an evolution to record games."));
    clear(bestEl);
    if (job?.ranked?.length) {
      const b = job.ranked[0];
      bestEl.append(el("h3", {}, "Current champion"), el("ul", {}, b.squad.map((u) => el("li", {}, `${label("chassis", u.chassis)}: ${upgradeName(u.longRangeUpgrade)}, ${upgradeName(u.meleeUpgrade)}, ${EQUIPMENT[u.equipment]?.label} / ${upgradeName(u.equipmentUpgrade)}`))),
        el("p", { class: "muted small" }, "Pilot weights: " + Object.entries(b.weights).map(([k, v]) => `${k} ${v}`).join(" · ")));
    }
    if (job?.calibration) renderCal(job.calibration, "evolved builds");
  };

  const renderCal = (cal, against) => {
    fill(calEl, el("h3", {}, `Difficulty calibration (bot win rate vs ${against})`),
      el("div", { class: "cal-row" }, ["easy", "normal", "hard"].map((t) => el("div", { class: `cal t-${t}` }, el("b", {}, t.toUpperCase()), el("span", {}, `${Math.round((cal[t] ?? 0) * 100)}%`),
        el("small", {}, { easy: "target ≤ 25%", normal: "target ≈ 50%", hard: "target ≥ 70%" }[t])))));
  };

  const start = async () => {
    try { job = await api.sim.evolve(params); allJobs.push(job); toast("Evolution started. Matches run on the server's worker pool.", "good"); poll(); }
    catch (e) { toast(e.message, "bad"); }
  };

  fill(root, el("div", { class: "lab" },
    el("div", { class: "b-head" }, el("button", { class: "btn ghost", onClick: () => { clearTimeout(timer); onBack(); } }, "← Back"), el("h1", {}, "🧬 Balance Lab"), el("span", { class: "muted" }, "Genetic meta-search: squads + upgrades + pilot weights evolve by playing each other.")),
    el("div", { class: "lab-controls" },
      field("population", "Population"), field("generations", "Generations"), field("gamesPer", "Games / genome"), field("mutationRate", "Mutation", 0.05),
      el("label", { title: "Ignore the gene pool and start from random genomes" }, "Fresh start", el("input", { type: "checkbox", onChange: (e) => { params.fresh = e.target.checked; } })),
      el("button", { class: "btn primary", onClick: start }, "▶ Evolve"),
      el("button", { class: "btn", onClick: async () => { if (job) { await api.sim.stop(job.id); toast("Stopping after this generation…"); } } }, "■ Stop"),
      el("button", { class: "btn", onClick: async () => { toast("Calibrating tiers. This takes a few minutes…"); try { const r = await api.sim.calibrate({ games: 12, job: job?.status === "done" ? job.id : undefined }); renderCal(r.calibration, r.against === "evolved" ? "evolved builds" : "average builds"); } catch (e) { toast(e.message, "bad"); } } }, "⚖ Calibrate tiers"),
      el("button", { class: "btn", onClick: async () => { if (!job) return; try { await api.sim.adopt(job.id); toast("Adopted. The Hard bot now plays this meta.", "good"); } catch (e) { toast(e.message, "bad"); } } }, "🏆 Adopt as Hard bot"),
    ),
    metaEl, pickerEl, statusEl,
    el("div", { class: "lab-main" }, el("div", { class: "lab-left" }, canvas, el("div", { class: "legend" }, el("span", { class: "l-best" }, "best"), el("span", { class: "l-mean" }, "mean")), bestEl, replaysEl, calEl), statsEl),
  ));
  // Resume the newest job if one exists, else show the last saved meta report.
  api.sim.jobs().then(({ jobs }) => { allJobs = jobs; const ga = jobs.filter((j) => j.kind === "ga"); if (ga.length) { job = ga.at(-1); draw(); if (job.status === "running") poll(); } else draw(); })
    .then(async () => {
      if (job) return;
      const { report } = await api.sim.meta();
      if (report) { job = { id: "saved", status: "saved report", generation: report.history.length - 1, params: { generations: report.history.length }, history: report.history, stats: report.stats, replays: [], ranked: [] }; draw(); }
    }).catch(() => draw());
}
