// Replay library on disk: every simulated game (GA matches, simulated rooms,
// tier demos) lands in data/replays/<id>.json.gz, with a small index.json of
// metadata for listing/filtering without opening each file. Survives restarts,
// so a GA run can be inspected match by match long after it finished.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

export function createReplayStore(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const indexFile = path.join(dir, "index.json");
  let index = [];
  try { index = JSON.parse(fs.readFileSync(indexFile, "utf8")); } catch {}
  let dirty = false;
  const flush = () => { if (!dirty) return; dirty = false; fs.writeFileSync(indexFile, JSON.stringify(index)); };
  const timer = setInterval(flush, 2000); timer.unref?.();
  let seq = index.length;

  // meta: { source: "ga"|"sim"|"demo", job?, generation?, label?, tiers?, table? }
  function save(result, squads, meta = {}) {
    const id = `${Date.now().toString(36)}-${(++seq).toString(36)}`;
    const entry = {
      id, createdAt: new Date().toISOString(), ...meta,
      winner: result.winner, reason: result.reason ?? null, vp: result.vp, rounds: result.rounds, finished: result.finished ?? true,
      squads: { a: squads.a.map((u) => u.chassis), b: squads.b.map((u) => u.chassis) },
      tiers: result.pilots?.tiers, frames: result.frames?.length ?? 0,
    };
    const body = { ...entry, squadsFull: squads, frames: result.frames, field: result.field, objectives: result.objectives, pilots: result.pilots, stats: result.stats };
    fs.writeFileSync(path.join(dir, `${id}.json.gz`), zlib.gzipSync(JSON.stringify(body)));
    index.push(entry);
    dirty = true;
    return entry;
  }

  function get(id) {
    if (!/^[a-z0-9-]+$/i.test(id)) return null;
    try { return JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(dir, `${id}.json.gz`))).toString()); } catch { return null; }
  }

  // Newest first; filter by source / job / chassis / winner.
  function list({ source, job, chassis, limit = 200, offset = 0 } = {}) {
    let rows = index;
    if (source) rows = rows.filter((r) => r.source === source);
    if (job) rows = rows.filter((r) => String(r.job) === String(job));
    if (chassis) rows = rows.filter((r) => r.squads.a.includes(chassis) || r.squads.b.includes(chassis));
    return { total: rows.length, rows: rows.slice().reverse().slice(offset, offset + limit) };
  }

  function remove(id) {
    const i = index.findIndex((r) => r.id === id);
    if (i < 0) return false;
    index.splice(i, 1); dirty = true;
    try { fs.unlinkSync(path.join(dir, `${id}.json.gz`)); } catch {}
    return true;
  }

  return { save, get, list, remove, flush, close: () => { clearInterval(timer); flush(); } };
}
