import { Router } from "express";
import { applyCommand, lastRejectionReason } from "../../shared/game-state.js";
import { driveBots } from "../../shared/bot/index.js";
import {
  buyUnlock, unlockedPools, creditRun, newRun, pickNode, missionAttrs, debrief, repair, recover,
  applyReward, buy, respec, continueRun, abandon, runSummary,
} from "../../shared/campaign/index.js";

// Routes mounted at /api/campaign (docs/design/campaign.md). The server is
// authoritative: the client picks, the server reads the finished battle room
// itself and never trusts a reported result. One profile, single player.
export function createCampaignRouter(rooms, campaign) {
  const router = Router();
  const view = (s, extra = {}) => ({ profile: s.profile, pools: unlockedPools(s.profile), run: s.run, last: s.last, ...extra });
  const fail = (res, out) => res.status(400).json(out);

  // A run that just ended pays its Renown into the profile, exactly once.
  function settle(s) {
    if (!s.run || s.run.status !== "over" || s.run.settled) return s;
    const summary = runSummary(s.run);
    const credited = creditRun(s.profile, summary);
    return { ...s, profile: credited.profile, run: { ...s.run, settled: true }, last: { ...summary, earned: credited.earned, unlocked: credited.unlocked } };
  }

  // Run-level mutators share one shape: fn(run, body) → { run } | { error }.
  const step = (fn) => (req, res) => {
    const s = campaign.get();
    if (!s.run) return fail(res, { error: "no-run" });
    const out = fn(s.run, req.body || {});
    if (out.error) return fail(res, out);
    const { run, ...rest } = out;
    res.json(view(campaign.save(settle({ ...s, run })), rest));
  };

  router.get("/", (req, res) => res.json(view(campaign.get())));

  router.post("/unlock", (req, res) => {
    const s = campaign.get();
    const out = buyUnlock(s.profile, req.body?.id);
    if (out.error) return fail(res, out);
    res.json(view(campaign.save({ ...s, profile: out.profile })));
  });

  router.post("/run", (req, res) => {
    const s = campaign.get();
    if (s.run && s.run.status !== "over") return fail(res, { error: "run-live" });
    const seed = Number.isFinite(req.body?.seed) ? req.body.seed : (Date.now() >>> 0);
    const out = newRun(s.profile, req.body || {}, seed);
    if (out.error) return fail(res, out);
    const profile = { ...s.profile, runs: (s.profile.runs || 0) + 1 };
    res.json(view(campaign.save({ ...s, profile, run: out.run })));
  });

  // Pick a map node. A contract builds and starts its mission room here.
  router.post("/run/node", (req, res) => {
    const s = campaign.get();
    if (!s.run) return fail(res, { error: "no-run" });
    const out = pickNode(s.run, req.body?.nodeId);
    if (out.error) return fail(res, out);
    let run = out.run;
    if (run.status === "battle") {
      const code = `CAMP-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
      const room = rooms.getOrCreateRoom(code);
      applyCommand(room, { verb: "mission", attrs: missionAttrs(run, run.contract) }, { side: "a" });
      if (!room.game.started) return fail(res, { error: "mission", reason: lastRejectionReason() });
      driveBots(room);
      rooms.persist();
      run = { ...run, room: code };
    }
    res.json(view(campaign.save({ ...s, run })));
  });

  // The battle is over: read the room and write the debrief into the run.
  router.post("/run/resolve", (req, res) => {
    const s = campaign.get();
    if (!s.run?.room) return fail(res, { error: "no-battle" });
    const room = rooms.getRoom(s.run.room);
    if (!room) return fail(res, { error: "no-room" });
    const out = debrief(s.run, room);
    if (out.error) return fail(res, out);
    const run = { ...out.run, room: null, lastDebrief: out.debrief };
    res.json(view(campaign.save(settle({ ...s, run })), { debrief: out.debrief }));
  });

  router.post("/run/repair", step((run, b) => repair(run, b)));
  router.post("/run/recover", step((run, b) => recover(run, b.uid)));
  router.post("/run/reward", step((run, b) => applyReward(run, b)));
  router.post("/run/buy", step((run, b) => buy(run, b)));
  router.post("/run/respec", step((run, b) => respec(run, b)));
  router.post("/run/continue", step((run) => continueRun(run)));
  router.post("/run/abandon", step((run) => abandon(run)));

  // Leave the end-of-run screen: the finished run is cleared.
  router.post("/run/close", (req, res) => {
    const s = campaign.get();
    if (s.run && s.run.status !== "over") return fail(res, { error: "run-live" });
    res.json(view(campaign.save({ ...s, run: null })));
  });

  return router;
}
