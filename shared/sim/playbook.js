// Turn a finished GA run into the Hard bot's playbook (the shape of META in
// shared/bot/meta.js): champion weights, chassis ranked by win rate, and per
// chassis the upgrade/equipment picks with the best aggregate win rates.
// `champion` (default: the GA's fittest) supplies the pilot weights and its own
// squad's builds win ties for its chassis.
export function playbookFrom(res, champion = res.best.g) {
  const win = (kind, id) => res.stats.find((s) => s.kind === kind && s.id === id)?.winRate ?? 0;
  const chassisRank = res.stats.filter((s) => s.kind === "chassis" && s.games >= 2)
    .sort((a, b) => b.winRate - a.winRate).map((s) => s.id);
  const builds = {};
  for (const g of [champion, ...res.population]) {
    for (const u of g.squad) {
      const score = win("lr", u.longRangeUpgrade) + win("melee", u.meleeUpgrade) + win("equipUp", u.equipmentUpgrade) + (g === champion ? 10 : 0);
      if (!builds[u.chassis] || score > builds[u.chassis].score) builds[u.chassis] = { ...u, score };
    }
  }
  for (const b of Object.values(builds)) { delete b.chassis; b.score = +(b.score % 10).toFixed(3); }
  // The champion's own chassis lead the ranking, they're the proven squad.
  const own = champion.squad.map((u) => u.chassis);
  chassisRank.sort((a, b) => (own.includes(b) ? 1 : 0) - (own.includes(a) ? 1 : 0));
  return { weights: champion.weights, builds, chassisRank, generatedAt: new Date().toISOString() };
}

// Source text for shared/bot/meta.js, keeping the file's header comment.
export function metaSource(currentSrc, meta) {
  const head = currentSrc.slice(0, currentSrc.indexOf("export const META"));
  return head + "export const META = " + JSON.stringify(meta, null, 2) + ";\n";
}
