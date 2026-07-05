import { useEffect, useRef, createElement, type ReactNode } from "react";
import { useRoomState } from "../state/RoomStateContext";
import { useRoll } from "../state/RollContext";
import { useDrawer } from "../state/DrawerContext";
import { useBattleActions } from "../state/BattleActionsContext";
import { useWizard } from "../state/WizardContext";
import { useCommands } from "./useCommands";
import ChoiceField from "../components/overlays/ChoiceField";
import ReactionPicker from "../components/overlays/ReactionPicker";
import type { Rig, Resolution, PrepType } from "../state/types";

interface RecapLine {
  text: string;
  effects: string[];
}

/** Recap body for the activation-summary drawer (battle.js:87-113). */
function RecapBody({ lines }: { lines: RecapLine[] }): ReactNode {
  if (!lines.length) {
    return createElement(
      "div",
      { className: "dwr-recap" },
      createElement(
        "p",
        { className: "dwr-hint" },
        "No combat actions this activation — repositioning only.",
      ),
    );
  }
  return createElement(
    "div",
    { className: "dwr-recap" },
    lines.map((line, i) =>
      createElement(
        "div",
        { className: "dwr-recap-row", key: i },
        createElement("div", { className: "dwr-recap-line" }, line.text),
        line.effects.map((eff, j) =>
          createElement("div", { className: "dwr-recap-eff", key: j }, eff),
        ),
      ),
    ),
  );
}

/**
 * Runs the two battle overlay watchers as effects (battle.js:47-120):
 *   1. Resolution watcher — plays the newest fresh resolution log entry.
 *   2. Activation-summary watcher — recaps a Rig's activation when it ends.
 * Renders nothing; drives the roll/drawer overlay services. Call once.
 */
export function useBattleWatchers(): void {
  const { rigs, game, session } = useRoomState();
  const { playResolution } = useRoll();
  const { openDrawer, closeDrawer } = useDrawer();
  const { sendReact } = useBattleActions();
  const { openAttack } = useWizard();

  // ---- Resolution log watcher (battle.js:47-56) ----
  const lastSeenResolution = useRef(0);
  useEffect(() => {
    const log = game?.resolutions || [];
    const fresh = log.filter((e) => e.id > lastSeenResolution.current);
    if (!fresh.length) return;
    lastSeenResolution.current = log[log.length - 1].id;
    // Play only the newest to avoid a backlog stampede.
    void playResolution(fresh[fresh.length - 1]);
  }, [game?.resolutions, playResolution]);

  // ---- Answer-token gate: mandatory immediate placement ----
  const sendCommand = useCommands();
  const answerShownFor = useRef<number>(-1); // remaining count last shown
  useEffect(() => {
    const g = gameRef.current;
    const mine = sessionRef.current?.side || "a";
    const gate = g?.pendingAnswer;
    if (!gate || gate.side !== mine) { answerShownFor.current = -1; return; }
    if (answerShownFor.current === gate.remaining) return; // already prompting this step
    answerShownFor.current = gate.remaining;

    const eligible = (rigsRef.current || []).filter(
      (r) => (r.owner || "a") === mine && !r.destroyed && r.preparation == null,
    );
    if (!eligible.length) return; // server clears the gate on its own

    const pick = { rigName: eligible[0].name, prep: "brace" as PrepType };
    const build = () => (
      <div className="dwr-recap">
        <p className="dwr-hint">
          Answer token — {gate.remaining} left. Choose a Rig, then a facedown reaction.
        </p>
        <ChoiceField
          label="Rig"
          options={eligible.map((r) => ({ value: r.name, label: r.name }))}
          value={pick.rigName}
          onChange={(v) => (pick.rigName = v)}
        />
        <ReactionPicker value={pick.prep} onChange={(v) => (pick.prep = v)} />
      </div>
    );
    openDrawer({
      title: "⟡ Answer Tokens — prepare a reaction",
      tone: "oil",
      dismissable: false,
      render: build,
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
  }, [game?.pendingAnswer?.remaining, game?.pendingAnswer?.side]);

  // ---- Reaction watcher: defender resolves a triggered facedown reaction ----
  // When an incoming attack reveals an Evasive/Return-Fire prep, the server parks
  // a `pendingReaction` keyed to the defender. Only that side gets a decision
  // drawer; everyone else waits (see BattleHud's "Opponent is reacting…" line).
  const reactionShown = useRef(false);
  useEffect(() => {
    const g = gameRef.current;
    const mine = sessionRef.current?.side || "a";
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
            { className: "dwr-hint" },
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
            { className: "dwr-hint" },
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
  }, [game?.pendingReaction?.targetId, game?.pendingReaction?.kind]);

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
