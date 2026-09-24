// Worker thread: plays headless matches for the GA so the HTTP server stays
// responsive while a sweep runs. Receives { id, job } and replies { id, result }.
import { parentPort } from "node:worker_threads";
import { playMatch } from "../../shared/sim/match.js";

parentPort.on("message", ({ id, job }) => {
  try {
    const r = playMatch(job);
    // Frames only travel back when asked for (replays) — they're large.
    parentPort.postMessage({ id, result: r });
  } catch (err) {
    parentPort.postMessage({ id, error: String(err?.stack || err) });
  }
});
