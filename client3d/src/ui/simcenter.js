// Sim Center: queue simulated games on the server (bot vs bot, played through
// the real engine path) and browse the replay library — every GA match,
// simulated room, tier demo and calibration game — to watch any of them in 3D.
import { el, fill, toast } from "./dom.js";
import { api } from "../api.js";
import { CHASSIS } from "/shared/game-state.js";

const SIDES = [["easy", "Easy bot"], ["normal", "Normal bot"], ["hard", "Hard bot (GA meta)"], ["random", "Random build + evolved-style pilot"]];
const SOURCES = [["", "All"], ["ga", "GA matches"], ["sim", "Simulated rooms"], ["demo", "Watch demos"], ["calibration", "Calibration"]];
const nameOf = (id) => CHASSIS.find((c) => c.id === id)?.name ?? id;

export function simCenter(root, { onBack, onOpen, filter = {} }) {
  const form = { a: "normal", b: "hard", count: 10, table: "standard" };
  const f = { source: filter.job ? "" : (filter.source ?? ""), job: filter.job ?? "", chassis: "", generation: filter.generation ?? "" };
  const batchesEl = el("div", { class: "batches" });
  const listEl = el("div", { class: "lib-list" });
  const countEl = el("span", { class: "muted" });
  const batches = [];
  let rows = [];

  const sel = (opts, value, on) => el("select", { onChange: (e) => on(e.target.value) }, opts.map(([v, l]) => el("option", { value: v, selected: v === value }, l)));

  async function queue() {
    const table = form.table === "skirmish" ? { width: 42, height: 28 } : null;
    try {
      const b = await api.sim.rooms({ a: form.a, b: form.b, count: form.count, table });
      batches.unshift(b);
      toast(`Queued ${form.count} simulated games on the server.`, "good");
      pollBatch(b.id);
    } catch (e) { toast(e.message, "bad"); }
  }

  async function pollBatch(id) {
    const b = await api.sim.batch(id).catch(() => null);
    if (!b) return;
    const i = batches.findIndex((x) => x.id === id); if (i >= 0) batches[i] = b;
    renderBatches();
    if (b.status === "running") setTimeout(() => pollBatch(id), 1500);
    else load();
  }

  function renderBatches() {
    fill(batchesEl, batches.map((b) => el("div", { class: "batch" },
      el("b", {}, `${b.params.a} vs ${b.params.b}`), el("span", { class: "muted" }, ` · ${b.done}/${b.games}`),
      el("div", { class: "bar" }, el("i", { style: { width: `${(b.done / b.games) * 100}%`, background: "var(--gold)" } })),
      b.summary ? el("div", { class: "small" }, `Cyan ${b.summary.a} · Red ${b.summary.b} · draws ${b.summary.draw}`) : null,
      el("button", { class: "btn ghost", onClick: () => { f.job = b.id; f.source = ""; f.generation = ""; renderFilters(); load(); } }, "Show games"))));
  }

  async function load() {
    try {
      const r = await api.sim.replays({ source: f.source, job: f.job, chassis: f.chassis, limit: 500 });
      rows = f.generation !== "" ? r.rows.filter((x) => String(x.generation) === String(f.generation)) : r.rows;
      countEl.textContent = `${rows.length} of ${r.total} games`;
      renderRows();
    } catch (e) { toast(e.message, "bad"); }
  }

  function renderRows() {
    fill(listEl, rows.length ? el("table", { class: "lib" },
      el("tr", {}, ["When", "Source", "Cyan", "Red", "Result", "Rounds", ""].map((h) => el("th", {}, h))),
      rows.map((r) => el("tr", { class: "lib-row", onClick: () => open(r.id) },
        el("td", { class: "small muted" }, new Date(r.createdAt).toLocaleString()),
        el("td", {}, el("span", { class: `src s-${r.source}` }, r.source), " ", el("span", { class: "small muted" }, r.label || "")),
        el("td", {}, r.tiers?.a && r.tiers.a !== "balanced" ? el("i", { class: "small" }, r.tiers.a + " ") : null, r.squads.a.map((id) => el("span", { class: `swatch sw-${nameOf(id)}`, title: nameOf(id) }))),
        el("td", {}, r.tiers?.b && r.tiers.b !== "balanced" ? el("i", { class: "small" }, r.tiers.b + " ") : null, r.squads.b.map((id) => el("span", { class: `swatch sw-${nameOf(id)}`, title: nameOf(id) }))),
        el("td", { class: r.winner === "a" ? "w-a" : r.winner === "b" ? "w-b" : "" }, `${r.winner ? (r.winner === "a" ? "Cyan" : "Red") : "Draw"} ${r.vp?.join("–")}${r.reason === "annihilation" ? " 💀 wipe-out" : ""}`),
        el("td", {}, String(r.rounds ?? "")),
        el("td", {}, el("button", { class: "btn ghost", onClick: (e) => { e.stopPropagation(); open(r.id); } }, "▶"))))) : el("p", { class: "muted" }, "No games yet — queue some above."));
  }

  async function open(id) {
    toast("Loading replay…");
    try { onOpen(await api.sim.replay(id)); } catch (e) { toast(e.message, "bad"); }
  }

  const filtersEl = el("div", { class: "lib-filters" });
  function renderFilters() {
    fill(filtersEl,
      el("label", {}, "Source ", sel(SOURCES, f.source, (v) => { f.source = v; load(); })),
      el("label", {}, "Chassis ", sel([["", "Any"], ...CHASSIS.map((c) => [c.id, c.name])], f.chassis, (v) => { f.chassis = v; load(); })),
      f.job ? el("span", { class: "chip" }, `run ${f.job}${f.generation !== "" ? ` · gen ${Number(f.generation) + 1}` : ""} `, el("button", { class: "x", onClick: () => { f.job = ""; f.generation = ""; renderFilters(); load(); } }, "✕")) : null,
      countEl);
  }

  fill(root, el("div", { class: "lab simcenter" },
    el("div", { class: "b-head" }, el("button", { class: "btn ghost", onClick: onBack }, "← Back"), el("h1", {}, "🛰 Sim Center"),
      el("span", { class: "muted" }, "Bot-vs-bot games played on the server through the real engine — every one saved for replay.")),
    el("div", { class: "sim-form" },
      el("label", {}, "Cyan ", sel(SIDES, form.a, (v) => { form.a = v; })),
      el("span", {}, "vs"),
      el("label", {}, "Red ", sel(SIDES, form.b, (v) => { form.b = v; })),
      el("label", {}, "Table ", sel([["standard", "Standard 54×36"], ["skirmish", "Skirmish 42×28"]], form.table, (v) => { form.table = v; })),
      el("label", {}, "Games ", el("input", { type: "number", min: 1, max: 200, value: form.count, onInput: (e) => { form.count = Number(e.target.value) || 1; } })),
      el("button", { class: "btn primary", onClick: queue }, "▶ Simulate")),
    batchesEl,
    el("h3", {}, "Replay library"),
    filtersEl, listEl,
  ));
  renderFilters();
  // Resume polling any batch still running on the server.
  api.sim.jobs().then(({ jobs }) => { for (const j of jobs.filter((x) => x.kind === "rooms").slice(-5).reverse()) { batches.push(j); if (j.status === "running") pollBatch(j.id); } renderBatches(); }).catch(() => {});
  load();
}
