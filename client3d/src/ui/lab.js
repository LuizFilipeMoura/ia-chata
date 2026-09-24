// Balance Lab, in plain language. One question up front: "Which rigs and
// upgrades are too strong?" One button runs bot-vs-bot games on the server (the
// genetic search), and the answer comes back as short verdicts ("Gold is winning
// 61% of its games: likely too strong"). A verdict is only given when the 95%
// confidence range clears 50%, so dice luck isn't reported as balance. Every
// knob, chart and raw table lives in the "Advanced" fold, each explained.
import { el, fill, toast } from "./dom.js";
import { api } from "../api.js";
import { CHASSIS, WEAPON_UPGRADES, EQUIPMENT } from "/shared/game-state.js";
import { EQUIPMENT_UPGRADES } from "/shared/rules.js";

const upgradeInfo = (id) => {
  for (const [weapon, list] of [...Object.entries(WEAPON_UPGRADES), ...Object.entries(EQUIPMENT_UPGRADES)]) {
    const u = list.find((x) => x.id === id);
    if (u) return { name: u.name, owner: EQUIPMENT[weapon]?.label ?? weapon, nature: u.nature };
  }
  return { name: id, owner: "", nature: "" };
};
const chassisName = (id) => CHASSIS.find((c) => c.id === id)?.name ?? id;

// Human names for every kind of thing the lab measures.
function describe(kind, id) {
  if (kind === "chassis") return { name: chassisName(id), what: `rig (${CHASSIS.find((c) => c.id === id)?.label ?? ""})` };
  if (kind.startsWith("chassis@")) return { name: chassisName(id), what: kind.endsWith("skirmish") ? "rig, on the small Skirmish table" : "rig, on the Standard table" };
  if (kind === "lr" || kind === "melee" || kind === "equipUp") { const u = upgradeInfo(id); return { name: u.name, what: `${u.nature} upgrade for ${u.owner}` }; }
  if (kind === "equip") return { name: EQUIPMENT[id]?.label ?? id, what: "equipment" };
  if (kind === "comp") return { name: id.replace(/^0M/, "").replace("M", " medium + ").replace("L", " light"), what: "squad makeup" };
  if (kind === "table") return { name: id === "skirmish" ? "Skirmish table" : "Standard table", what: "table size" };
  return { name: id, what: kind };
}

// Verdict for one stats row. Only calls it when the whole 95% range sits on one
// side of 50%.
function verdict(r) {
  if (r.games < 8) return "unknown";
  if (r.ciLow > 0.5) return "strong";
  if (r.ciHigh < 0.5) return "weak";
  return "fine";
}

function chart(canvas, history) {
  const g = canvas.getContext("2d");
  const W = (canvas.width = canvas.clientWidth * devicePixelRatio), H = (canvas.height = canvas.clientHeight * devicePixelRatio);
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
  let job = null, timer = null, allJobs = [], meta = null;
  const params = { population: 16, generations: 6, gamesPer: 4, mutationRate: 0.25, fresh: false };

  const statusEl = el("div", { class: "lab-progress" });
  const answerEl = el("div", { class: "lab-answer" });
  const actionsEl = el("div", { class: "lab-next" });
  const noticeEl = el("div");
  const advBody = el("div", { class: "adv-body" });

  const poll = async () => {
    if (!job) return;
    try { job = await api.sim.job(job.id); } catch { return; }
    draw();
    if (job.status === "running") timer = setTimeout(poll, 2500);
  };

  const run = async () => {
    try {
      job = await api.sim.evolve(params); allJobs.push(job);
      toast("Started. The server is playing the games; you can leave this screen and come back.", "good", 4500);
      poll();
    } catch (e) { toast(e.message, "bad"); }
  };

  // ---- The answer ----
  function renderAnswer() {
    const rows = (job?.stats || []).filter((r) => ["chassis", "lr", "melee", "equipUp", "equip", "comp"].includes(r.kind));
    if (!rows.length) {
      fill(answerEl, el("p", { class: "muted" }, job?.status === "running"
        ? "The first results appear after the first round of games."
        : "No results yet. Press the button above to find out."));
      return;
    }
    const groups = { strong: [], weak: [], fine: [], unknown: [] };
    rows.forEach((r) => groups[verdict(r)].push(r));
    groups.strong.sort((a, b) => b.winRate - a.winRate);
    groups.weak.sort((a, b) => a.winRate - b.winRate);
    const line = (r, tone) => {
      const d = describe(r.kind, r.id);
      const pct = Math.round(r.winRate * 100), pm = Math.round(((r.ciHigh - r.ciLow) / 2) * 100);
      const tail = tone === "strong" ? "likely too strong." : tone === "weak" ? "likely too weak." : "about even.";
      return el("li", { class: `v-${tone}` },
        el("b", {}, d.name), el("span", { class: "muted" }, ` (${d.what})`),
        ` is winning ${pct}% of its games`, el("span", { class: "muted", title: "95% confidence range" }, ` (±${pm})`), `: ${tail}`,
        el("span", { class: "muted small" }, ` ${r.games} games`));
    };
    const done = job.status !== "running";
    fill(answerEl,
      el("h3", {}, done ? "What the games showed" : "Early results (still playing)"),
      groups.strong.length ? [el("h4", { class: "h-strong" }, "⬆ Too strong"), el("ul", {}, groups.strong.map((r) => line(r, "strong")))] : el("p", {}, "Nothing is clearly too strong. ", el("span", { class: "muted" }, "That's good news.")),
      groups.weak.length ? [el("h4", { class: "h-weak" }, "⬇ Too weak"), el("ul", {}, groups.weak.map((r) => line(r, "weak")))] : el("p", {}, "Nothing is clearly too weak."),
      el("details", { class: "fine" }, el("summary", {}, `✓ ${groups.fine.length} look balanced, ${groups.unknown.length} not enough games yet`),
        el("ul", {}, groups.fine.sort((a, b) => b.winRate - a.winRate).map((r) => line(r, "fine")))),
      el("p", { class: "muted small" }, "A verdict is only given when the result is clear of dice luck. Anything \"about even\" might still lean one way; run more games to be sure."));
  }

  function renderNext() {
    const has = job && job.id !== "saved" && (job.done || 0) > 0;
    fill(actionsEl,
      has ? el("button", { class: "btn", onClick: () => onLibrary({ job: job.id }) }, `▶ Watch the ${job.done} games`) : null,
      job?.status === "done" ? el("button", { class: "btn", title: "The Hard difficulty bot will pick the best rigs and upgrades found here, and fly them the way the winners did.",
        onClick: async () => { try { await api.sim.adopt(job.id); toast("The Hard bot now plays like this run's winners.", "good"); } catch (e) { toast(e.message, "bad"); } } }, "🏆 Teach the Hard bot these tactics") : null,
      job?.status === "running" ? el("button", { class: "btn ghost", onClick: async () => { await api.sim.stop(job.id); toast("Stopping after the current round of games…"); } }, "■ Stop") : null);
  }

  function renderStatus() {
    if (!job || job.id === "saved") { fill(statusEl); return; }
    const pct = job.games ? Math.min(100, Math.round((job.done / (job.games / Math.max(1, job.generation + 1) * job.params.generations)) * 100)) : 0;
    const txt = job.status === "running"
      ? `Playing games… round ${job.generation + 2 > job.params.generations ? job.params.generations : job.generation + 2} of ${job.params.generations} · ${job.done} games so far`
      : job.status === "done" ? `Finished: ${job.done} games played.` : job.status === "interrupted" ? "This run was interrupted (server restarted). Its results so far are still here." : `Run ${job.status}.`;
    fill(statusEl, el("div", {}, txt), job.status === "running" ? el("div", { class: "bar" }, el("i", { style: { width: `${pct}%`, background: "var(--brass)" } })) : null);
  }

  // ---- Advanced: every knob, explained ----
  function renderAdvanced() {
    const field = (k, label, help, step = 1) => el("label", { class: "adv-field" },
      el("b", {}, label), el("input", { type: "number", value: params[k], step, onInput: (e) => { params[k] = Number(e.target.value); } }), el("span", { class: "muted small" }, help));
    const stats = job?.stats || [];
    const kinds = [["chassis", "Rigs"], ["chassis@standard", "Rigs on the Standard table"], ["chassis@skirmish", "Rigs on the Skirmish table"], ["lr", "Long-range upgrades"], ["melee", "Melee upgrades"], ["equip", "Equipment"], ["equipUp", "Equipment upgrades"], ["comp", "Squad makeups"], ["table", "Table sizes"]];
    const canvas = el("canvas", { class: "lab-chart" });
    const ga = allJobs.filter((j) => j.kind === "ga");
    fill(advBody,
      el("p", { class: "muted" }, "How it works: the server builds many random squads, each with its own bot pilot. They play each other; the winners are kept, mixed and slightly changed, and play again. After a few rounds of this, whatever keeps winning is what the rules favour."),
      el("div", { class: "adv-grid" },
        field("population", "Squads per round", "How many different squads compete each round. More finds more, slower."),
        field("generations", "Rounds", "How many times the winners are bred and re-tested."),
        field("gamesPer", "Games per squad", "Games each squad plays per round. More games = less luck in the results."),
        field("mutationRate", "Variation", "How much each new squad differs from its parents (0 to 1).", 0.05),
        el("label", { class: "adv-field" }, el("b", {}, "Start from scratch"), el("input", { type: "checkbox", checked: params.fresh, onChange: (e) => { params.fresh = e.target.checked; } }),
          el("span", { class: "muted small" }, `Normally a run continues from the best squads of earlier runs (${meta?.genePool ?? "?"} saved). Tick to ignore them.`))),
      ga.length ? el("label", { class: "adv-field" }, el("b", {}, "Show an earlier run"), el("select", { onChange: async (e) => { job = await api.sim.job(e.target.value); clearTimeout(timer); draw(); if (job.status === "running") poll(); } },
        ga.slice().reverse().map((j) => el("option", { value: j.id, selected: job?.id === j.id }, `${new Date(j.startedAt).toLocaleString()} · ${j.done ?? "?"} games · ${j.status}`)))) : null,
      el("h4", {}, "Progress chart"),
      el("p", { class: "muted small" }, "Gold line: the best squad's score each round. Blue: the average. Rising gold means the search is finding stronger combinations."),
      canvas,
      el("h4", {}, "Difficulty check"),
      el("p", { class: "muted small" }, "Plays each bot difficulty against ordinary squads to confirm Easy loses most games, Normal about half, Hard most."),
      el("button", { class: "btn", onClick: async () => { toast("Checking difficulties. This takes a few minutes…"); try { const r = await api.sim.calibrate({ games: 12 }); toast(`Bot win rates: Easy ${Math.round(r.calibration.easy * 100)}%, Normal ${Math.round(r.calibration.normal * 100)}%, Hard ${Math.round(r.calibration.hard * 100)}%`, "good", 8000); } catch (e) { toast(e.message, "bad"); } } }, "Check bot difficulties"),
      el("h4", {}, "All numbers"),
      el("p", { class: "muted small" }, "Win rate with its 95% range. Orange: clearly strong. Blue: clearly weak."),
      el("div", { class: "lab-stats" }, kinds.map(([k, title]) => {
        const rows = stats.filter((s) => s.kind === k).sort((a, b) => b.winRate - a.winRate);
        return rows.length ? el("div", { class: "stat-block" }, el("h3", {}, title), el("table", {},
          el("tr", {}, el("th", {}, "Name"), el("th", {}, "Win %"), el("th", {}, "Games")),
          rows.map((r) => el("tr", { class: verdict(r) === "strong" ? "hot" : verdict(r) === "weak" ? "cold" : "" },
            el("td", {}, describe(k, r.id).name), el("td", {}, `${Math.round(r.winRate * 100)}% ±${Math.round(((r.ciHigh - r.ciLow) / 2) * 100)}`), el("td", {}, String(r.games)))))) : null;
      })));
    requestAnimationFrame(() => chart(canvas, job?.history || []));
  }

  function draw() { renderStatus(); renderAnswer(); renderNext(); if (advBody.isConnected && advBody.parentElement.open) renderAdvanced(); }

  const adv = el("details", { class: "lab-adv", onToggle: (e) => { if (e.target.open) renderAdvanced(); } }, el("summary", {}, "Advanced: settings, charts and raw numbers"), advBody);
  fill(root, el("div", { class: "lab lab-plain" },
    el("div", { class: "b-head" }, el("button", { class: "btn ghost", onClick: () => { clearTimeout(timer); onBack(); } }, "← Back"), el("h1", {}, "🧬 Balance Lab")),
    noticeEl,
    el("div", { class: "lab-question" },
      el("h2", {}, "Which rigs and upgrades are too strong?"),
      el("p", { class: "muted" }, "Bots play hundreds of games on the server with every rig, upgrade and equipment, using exactly the game's rules, and report what wins too often or too rarely. Takes about 30 to 60 minutes; you can leave and come back."),
      el("button", { class: "btn big primary", onClick: run }, "▶ Find out"),
      statusEl),
    answerEl, actionsEl, adv));

  api.sim.meta().then((m) => {
    meta = m;
    if (m.stale) fill(noticeEl, el("div", { class: "warn-banner" }, "You changed the rules since the Hard bot last learned. Run the lab again, then teach the Hard bot, so it plays the new rules well."));
  }).catch(() => {});
  api.sim.jobs().then(({ jobs }) => {
    allJobs = jobs;
    const ga = jobs.filter((j) => j.kind === "ga");
    if (ga.length) { job = ga.at(-1); if (job.status === "running") poll(); }
    draw();
  }).catch(() => draw());
}
