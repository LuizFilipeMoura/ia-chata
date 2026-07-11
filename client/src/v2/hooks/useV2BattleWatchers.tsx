import { useEffect, useRef, useState, createElement, type ReactNode } from "react";
import { useRoomState } from "../../state/RoomStateContext";
import { useV2Roll } from "../state/V2RollContext";
import { useV2Drawer } from "../state/V2DrawerContext";
import { useV2BattleActions } from "../state/V2BattleActionsContext";
import { useV2Wizard } from "../state/V2WizardContext";
import { useCommands } from "../../hooks/useCommands";
import ChoiceField from "../overlays/ChoiceField";
import ReactionPicker from "../overlays/ReactionPicker";
import "../styles/overlay.css";
import type { Rig, Resolution, PrepType } from "../../state/types";
import { partNamesOf, kindOf } from "/shared/unit-kinds.js";
import { phaseSummary } from "/shared/battle-view.js";
import { useMySide } from "../../hooks/useMySide";
import { HEAT_CAPACITY } from "/shared/game-state.js";
import { playDamage, playHeat, playEngineStart, startEngineLoop, stopEngineLoop } from "../audio/actionAudio";

interface RecapLine {
  text: string;
  effects: string[];
}

/** Recap body for the activation-summary drawer (battle.js:87-113). */
function RecapBody({ lines }: { lines: RecapLine[] }): ReactNode {
  if (!lines.length) {
    return createElement(
      "div",
      { className: "v2-dwr-recap" },
      createElement(
        "p",
        { className: "v2-dwr-hint" },
        "No combat actions this activation — repositioning only.",
      ),
    );
  }
  return createElement(
    "div",
    { className: "v2-dwr-recap" },
    lines.map((line, i) =>
      createElement(
        "div",
        { className: "v2-dwr-recap-row", key: i },
        createElement("div", { className: "v2-dwr-recap-line" }, line.text),
        line.effects.map((eff, j) =>
          createElement("div", { className: "v2-dwr-recap-eff", key: j }, eff),
        ),
      ),
    ),
  );
}

// Answer-token gate body. Owns the Rig + reaction selection in local state so the
// ChoiceField/ReactionPicker actually re-render on each pick; mirrors both into the
// caller's `pick` ref for the "Set reaction" handler (matches PrepareBody's pattern).
export function AnswerGateBody({
  remaining, eligible, pick,
}: {
  remaining: number;
  eligible: Rig[];
  pick: { rigName: string; prep: PrepType };
}) {
  const [rigName, setRigName] = useState(pick.rigName);
  const [prep, setPrep] = useState<PrepType>(pick.prep);
  const sel = eligible.find((r) => r.name === rigName) || eligible[0];
  return (
    <div className="v2-dwr-recap">
      <p className="v2-dwr-hint">
        Answer token — {remaining} left. Choose a Rig, then a facedown reaction.
      </p>
      <ChoiceField
        label="Rig"
        options={eligible.map((r) => ({ value: r.name, label: r.name }))}
        value={rigName}
        onChange={(v) => { setRigName(v); pick.rigName = v; }}
      />
      <ReactionPicker
        value={prep}
        allowShield={sel?.weapons?.melee === "Bulwark Shield"}
        onChange={(v) => { setPrep(v); pick.prep = v; }}
      />
    </div>
  );
}

/** Sum of a rig's current Structure Points across all of its kind's parts. */
function totalSp(rig: Rig): number {
  return partNamesOf(kindOf(rig)).reduce(
    (sum, part) => sum + ((rig as unknown as Record<string, { sp?: number }>)[part]?.sp ?? 0),
    0,
  );
}

/**
 * Native V2 port of V1's useBattleWatchers (battle.js:47-120). Runs the four
 * battle overlay watchers as effects, driving the V2 overlay stack:
 *   1. Resolution watcher — plays the newest fresh resolution log entry.
 *   2. Answer-token gate — mandatory facedown-reaction placement.
 *   3. Reaction watcher — defender resolves a triggered facedown reaction.
 *   4. Activation-summary watcher — recaps a Rig's activation when it ends.
 * Also drives two audio effects: damage SFX on any SP drop, and the engine
 * idle loop while it's the local player's turn during activation.
 * Renders nothing; drives the V2 roll/drawer overlay services. Call once.
 */
export function useV2BattleWatchers(): void {
  const { rigs, game, session } = useRoomState();
  const { playResolution } = useV2Roll();
  const { openDrawer, closeDrawer } = useV2Drawer();
  const { sendReact } = useV2BattleActions();
  const { openAttack } = useV2Wizard();
  const mySide = useMySide();

  // ---- Resolution log watcher (battle.js:47-56) ----
  const lastSeenResolution = useRef(0);
  useEffect(() => {
    const log = game?.resolutions || [];
    const fresh = log.filter((e) => e.id > lastSeenResolution.current);
    if (!fresh.length) return;
    lastSeenResolution.current = log[log.length - 1].id;
    // Play fresh entries in order so dice-bearing resolutions (e.g. the attack
    // behind a revealed answer token) each get their roll animation instead of
    // being skipped. A large backlog (first hydrate) fast-forwards to the newest
    // to avoid a stampede.
    const toPlay = fresh.length > 3 ? [fresh[fresh.length - 1]] : fresh;
    void (async () => {
      for (const entry of toPlay) {
        // eslint-disable-next-line no-await-in-loop
        await playResolution(entry);
      }
    })();
  }, [game?.resolutions, playResolution]);

  // ---- Damage SFX: play when any rig's total Structure Points drops ----
  const spBaseline = useRef<Map<number, number> | null>(null);
  useEffect(() => {
    const prev = spBaseline.current;
    const next = new Map<number, number>();
    let dropped = false;
    for (const r of rigs) {
      const t = totalSp(r);
      next.set(r.id, t);
      if (prev && prev.has(r.id) && t < prev.get(r.id)!) dropped = true;
    }
    spBaseline.current = next;
    if (prev && dropped) playDamage(); // skip the first render (prev === null)
  }, [rigs]);

  // ---- Heat SFX: furnace roar when a rig crosses into overheat ----
  const heatBaseline = useRef<Map<number, number> | null>(null);
  useEffect(() => {
    const prev = heatBaseline.current;
    const next = new Map<number, number>();
    let overheated = false;
    for (const r of rigs) {
      const heat = r.engine?.heat ?? 0;
      next.set(r.id, heat);
      const cap = HEAT_CAPACITY[r.weightClass];
      if (prev && cap != null && prev.has(r.id) && prev.get(r.id)! <= cap && heat > cap) {
        overheated = true; // crossed from safe into overheat
      }
    }
    heatBaseline.current = next;
    if (prev && overheated) playHeat();
  }, [rigs]);

  // ---- Engine idle loop: rumble while it's your turn during activation ----
  const myTurn =
    game?.phase === "activation" && phaseSummary(game, rigs).turnSide === mySide;
  useEffect(() => {
    if (myTurn) startEngineLoop();
    else stopEngineLoop();
    return () => stopEngineLoop();
  }, [myTurn]);

  // ---- Engine start: ignition one-shot each time one of YOUR rigs activates ----
  const activeRigId = game?.turn?.activeRigId ?? null;
  const startSeeded = useRef(false);
  useEffect(() => {
    const active = activeRigId != null ? rigs.find((r) => r.id === activeRigId) : null;
    const mineActivating =
      !!active && (active.owner || "a") === mySide && game?.phase === "activation";
    if (startSeeded.current && mineActivating) playEngineStart();
    startSeeded.current = true; // skip the first render (hydration)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRigId]);

  // ---- Answer-token gate: mandatory immediate placement ----
  const sendCommand = useCommands();
  const answerShownFor = useRef<number>(-1); // remaining count last shown
  useEffect(() => {
    const g = gameRef.current;
    const mine = mySideRef.current;
    const gate = g?.pendingAnswer;
    if (!gate || gate.side !== mine) { answerShownFor.current = -1; return; }
    if (answerShownFor.current === gate.remaining) return; // already prompting this step
    answerShownFor.current = gate.remaining;

    const eligible = (rigsRef.current || []).filter(
      (r) => (r.owner || "a") === mine && !r.destroyed && r.preparation == null,
    );
    if (!eligible.length) return; // server clears the gate on its own

    const pick = { rigName: eligible[0].name, prep: "brace" as PrepType };
    openDrawer({
      title: "⟡ Answer Tokens — prepare a reaction",
      tone: "oil",
      dismissable: false,
      render: () => (
        <AnswerGateBody remaining={gate.remaining} eligible={eligible} pick={pick} />
      ),
      actions: [
        {
          label: "Set reaction",
          primary: true,
          icon: "⟡",
          onClick: () => {
            closeDrawer();
            sendCommand("answer", { name: pick.rigName, prep: pick.prep, side: mine });
          },
        },
      ],
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game?.pendingAnswer?.remaining, game?.pendingAnswer?.side, mySide]);

  // ---- Reaction watcher: defender resolves a triggered facedown reaction ----
  // When an incoming attack reveals an Evasive/Return-Fire prep, the server parks
  // a `pendingReaction` keyed to the defender. Only that side gets a decision
  // drawer; everyone else waits (see BattleHud's "Opponent is reacting…" line).
  const reactionShown = useRef(false);
  useEffect(() => {
    const g = gameRef.current;
    const mine = mySideRef.current;
    const pr = g?.pendingReaction;
    if (!pr || pr.defender !== mine) { reactionShown.current = false; return; }
    if (reactionShown.current) return;
    reactionShown.current = true;

    const rigsNow = rigsRef.current || [];
    const reactor = rigsNow.find((r) => r.id === pr.targetId); // the prepared rig
    const attacker = rigsNow.find((r) => r.id === pr.attackerId);
    if (!reactor) return;

    if (pr.kind === "evasive") {
      openDrawer({
        title: `💨 Evasive — ${reactor.name}`,
        tone: "oil",
        dismissable: false,
        render: () =>
          createElement(
            "p",
            { className: "v2-dwr-hint" },
            `Move ${reactor.name} up to ½ Speed on the table. Did it break ${attacker?.name || "the attacker"}'s line of sight or range?`,
          ),
        actions: [
          {
            label: "No — resolve the shot",
            ghost: true,
            onClick: () => { closeDrawer(); sendReact({ evaded: false }); },
          },
          {
            label: "Evaded — attack fails",
            primary: true,
            icon: "💨",
            onClick: () => { closeDrawer(); sendReact({ evaded: true }); },
          },
        ],
      });
    } else if (pr.kind === "return" && attacker) {
      openDrawer({
        title: `↩️ Return Fire — ${reactor.name}`,
        tone: "ember",
        dismissable: false,
        render: () =>
          createElement(
            "p",
            { className: "v2-dwr-hint" },
            `Answer ${attacker.name} with one weapon, or skip if you can't bear on it.`,
          ),
        actions: [
          {
            label: "Skip",
            ghost: true,
            onClick: () => { closeDrawer(); sendReact({ decline: true }); },
          },
          {
            label: "Return fire",
            primary: true,
            icon: "↩️",
            onClick: () => {
              closeDrawer();
              // Reuse the AttackWizard: pin the target to the attacker and send
              // the shot as a `react { attack }` instead of a normal `action`.
              openAttack(reactor, "fire", { target: attacker.name, react: true });
            },
          },
        ],
      });
    } else {
      // Return-Fire but the attacker is gone (destroyed) — nothing to answer.
      sendReact({ decline: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game?.pendingReaction?.targetId, game?.pendingReaction?.kind, mySide]);

  // ---- Activation summary watcher (battle.js:58-120) ----
  const watchedActiveRig = useRef<number | null>(null); // rig active on previous render
  const activationBaselineId = useRef(0); // highest resolution id when it started
  const summaryReady = useRef(false); // suppress a spurious recap on first load
  // Monotonic token: a recap auto-close timer only fires if no newer recap has
  // opened since — approximates battle.js's `card?.isConnected` guard.
  const recapToken = useRef(0);
  const closeTimer = useRef<number | null>(null);

  // Keep the latest game/rigs/session available to the effect without widening
  // its dependency list beyond the activeRigId trigger (matches battle.js which
  // reads S.game/S.rigs/S.session live).
  const gameRef = useRef(game);
  gameRef.current = game;
  const rigsRef = useRef(rigs);
  rigsRef.current = rigs;
  const sessionRef = useRef(session);
  sessionRef.current = session;
  // The side "I" am acting as — impersonation-aware (ViewSideContext override wins
  // over session.side). Mandatory gates key off this so seed-room testers acting
  // as either side still get the answer/reaction drawer. See useMySide.
  const mySideRef = useRef(mySide);
  mySideRef.current = mySide;

  useEffect(() => {
    const g = gameRef.current;
    const rigsNow = rigsRef.current;
    const active = g?.turn?.activeRigId ?? null;
    const log = g?.resolutions || [];
    const maxId = log.length ? log[log.length - 1].id : 0;

    if (!summaryReady.current) {
      watchedActiveRig.current = active;
      activationBaselineId.current = maxId;
      summaryReady.current = true;
      return;
    }
    if (active === watchedActiveRig.current) return;
    if (watchedActiveRig.current != null) {
      const prevId = watchedActiveRig.current;
      const rig = rigsNow.find((r) => r.id === prevId);
      const entries = log.filter(
        (e) => e.id > activationBaselineId.current && e.rigId === prevId,
      );
      if (rig) showActivationSummary(rig, entries);
    }
    watchedActiveRig.current = active;
    activationBaselineId.current = maxId;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game?.turn?.activeRigId]);

  function showActivationSummary(rig: Rig, entries: Resolution[]): void {
    const mine = (rig.owner || "a") === (sessionRef.current?.side || "a");
    const lines: RecapLine[] = [];
    for (const e of entries) {
      if (e.summary) lines.push({ text: e.summary, effects: e.effects || [] });
    }
    openDrawer({
      title: `${mine ? "🛠️ Your Rig" : "⚔️ Enemy"} · ${rig.name} — activation ended`,
      tone: mine ? "oil" : "ember",
      render: () => createElement(RecapBody, { lines }),
      actions: [{ label: "Continue", primary: true, onClick: () => closeDrawer() }],
    });
    // Non-blocking: fade the recap after a beat so the opponent's turns don't
    // stall play, but only if no newer recap has opened since (battle.js:119).
    const token = ++recapToken.current;
    if (closeTimer.current != null) clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => {
      if (recapToken.current === token) closeDrawer();
      closeTimer.current = null;
    }, 6500);
  }

  useEffect(
    () => () => {
      if (closeTimer.current != null) clearTimeout(closeTimer.current);
    },
    [],
  );
}
