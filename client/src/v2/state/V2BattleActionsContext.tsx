import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import { HEAT_CAPACITY } from "/shared/game-state.js";
import { kindOf, partNamesOf, UNIT_KINDS } from "/shared/unit-kinds.js";
import { useV2Drawer } from "./V2DrawerContext";
import { useV2Roll } from "./V2RollContext";
import { useRoomState } from "../../state/RoomStateContext";
import { useV2Commands } from "../hooks/useV2Commands";
import { useCommandCheck } from "../hooks/useCommandCheck";
import { onCommandRejected } from "../../state/commandRejectionBus";
import { playAction } from "../audio/actionAudio";
import { useMySide } from "../../hooks/useMySide";
import MoveBody from "../battle/MoveBody";
import RepairBody from "../battle/RepairBody";
import PrepareBody from "../battle/PrepareBody";
import BlastBody from "../battle/BlastBody";
import SupportBody from "../battle/SupportBody";
import { iconFor } from "../battle/constants";
import type { Rig, PrepType } from "../../state/types";

interface BattleActionsApi {
  openMove: (rig: Rig, key: string) => void;
  openRepair: (rig: Rig, action: string) => void;
  openPrepare: (rig: Rig) => void;
  openSupport: (rig: Rig, action: string) => void;
  resolveBlast: () => void;
  sendReact: (attrs: Record<string, unknown>) => void;
  endActivation: (rig: Rig) => void;
  rollInitiative: () => void;
  resetBattle: () => void;
}

// Meta for the three support-module actions (spec: Support Units) — Field
// Weld/Vent reach a friendly (self included), Paint reaches an enemy.
const SUPPORT_META: Record<string, { title: string; icon: string; label: string; needsLoc: boolean }> = {
  fieldweld: { title: "Field Weld", icon: "🔧", label: "Weld", needsLoc: true },
  vent: { title: "Vent", icon: "❄️", label: "Vent", needsLoc: false },
  paint: { title: "Paint", icon: "🎯", label: "Paint", needsLoc: false },
};

const Ctx = createContext<BattleActionsApi | null>(null);

// Native V2 port of V1's BattleActionsProvider. Same API and command dispatches;
// it drives the V2 drawer/roll primitives (useV2Drawer / useV2Roll) instead of
// the V1 ones.
export function V2BattleActionsProvider({ children }: { children: ReactNode }) {
  const { openDrawer, closeDrawer } = useV2Drawer();
  const { promptDice } = useV2Roll();
  const sendCommand = useV2Commands();
  const checkCommand = useCommandCheck();
  const { game, rigs } = useRoomState();

  // A blocking, dismissable dialog explaining why an action was refused. Fed both
  // by the preflight below (before a wizard opens) and, via the rejection bus, by
  // a server 409 on submit (see useCommands) — so an illegal action is always
  // explained, whichever layer catches it.
  const showRejection = useCallback(
    (reason: string) => {
      openDrawer({
        title: "⛔ Action blocked",
        tone: "ember",
        render: () => (
          <p style={{ margin: 0, lineHeight: 1.5 }} role="alert">
            {reason}
          </p>
        ),
        actions: [{ label: "OK", primary: true, onClick: () => closeDrawer() }],
      });
    },
    [openDrawer, closeDrawer],
  );

  // Surface server-side 409 rejections (raised on submit, after a wizard closed).
  useEffect(() => onCommandRejected(showRejection), [showRejection]);

  // Preflight before opening an action's wizard: if the server would refuse the
  // command, show the reason and never open the wizard. Returns true when the
  // caller may proceed.
  const guardAction = useCallback(
    async (verb: string, attrs: Record<string, unknown>): Promise<boolean> => {
      const { ok, reason } = await checkCommand(verb, attrs);
      if (!ok) {
        showRejection(reason || "That action isn't allowed right now.");
        return false;
      }
      return true;
    },
    [checkCommand, showRejection],
  );

  const rigsRef = useRef(rigs);
  rigsRef.current = rigs;

  // Keep game current inside stable callbacks without recreating them.
  const gameRef = useRef(game);
  gameRef.current = game;

  const viewSide = useMySide();
  const mySide = useCallback(() => viewSide, [viewSide]);

  const promptOneDie = useCallback(
    async (label: string, cb: (d: number) => void) => {
      const out = await promptDice([{ key: "d", label, sides: 12 }], label);
      cb(out.d);
    },
    [promptDice],
  );

  const promptTwoDice = useCallback(
    async (label: string, cb: (a: number, b: number) => void) => {
      const out = await promptDice(
        [
          { key: "a", label: "Side A", sides: 12 },
          { key: "b", label: "Side B", sides: 12 },
        ],
        label,
      );
      cb(out.a, out.b);
    },
    [promptDice],
  );

  const openMove = useCallback(
    (rig: Rig, key: string) => {
      void (async () => {
      // Preflight before showing the wizard — an illegal move (engaged, pinned,
      // emplaced, no actions left, …) is explained up front instead of failing
      // silently after the player commits.
      if (!(await guardAction("action", { name: rig.name, action: key }))) return;
      // Spool the engine the moment the player selects to move (opens the wizard),
      // not when the move resolves. Dispatch-time cue is suppressed in useV2Commands.
      playAction(key);
      const sprint = key === "sprint";
      const enemies = (rigsRef.current || []).filter(
        (r) => !r.destroyed && r.owner !== rig.owner && r.engagedWith == null,
      );
      const state: { engage: string } = { engage: "" };
      openDrawer({
        title: `${iconFor(key)} ${sprint ? "Sprint" : "Move"} — ${rig.name}`,
        tone: "oil",
        dismissable: false,
        render: () => (
          <MoveBody
            rig={rig}
            actionKey={key}
            enemies={enemies}
            onEngageChange={(v) => (state.engage = v)}
            onCancel={() => closeDrawer()}
            onConfirm={() => {
              closeDrawer();
              const attrs: Record<string, unknown> = { name: rig.name, action: key };
              if (state.engage) attrs.engage = state.engage;
              sendCommand("action", attrs);
            }}
          />
        ),
      });
      })();
    },
    [openDrawer, closeDrawer, sendCommand, guardAction],
  );

  const openRepair = useCallback(
    (rig: Rig, action: string) => {
      void (async () => {
      if (!(await guardAction("action", { name: rig.name, action }))) return;
      const auto = gameRef.current?.autoResolve;
      const isPatch = action === "emergencypatch";
      // Local mutable location; ChoiceField re-renders via the drawer's render fn,
      // so track it in a ref-backed state closure using a plain object.
      const state = { loc: "hull" };
      const build = () => (
        <RepairBody
          isPatch={isPatch}
          auto={Boolean(auto)}
          onChange={(v) => (state.loc = v)}
        />
      );
      openDrawer({
        title: `${isPatch ? "🩹 Emergency Patch" : "🔧 Repair"} — ${rig.name}`,
        tone: "cool",
        render: build,
        actions: [
          { label: "Cancel", ghost: true, onClick: () => closeDrawer() },
          {
            label: isPatch ? "Patch" : "Repair",
            primary: true,
            icon: isPatch ? "🩹" : "🔧",
            onClick: () => {
              closeDrawer();
              if (isPatch) {
                sendCommand("action", { name: rig.name, action: "emergencypatch", loc: state.loc });
                return;
              }
              if (auto) {
                sendCommand("action", { name: rig.name, action: "repair", loc: state.loc });
              } else {
                promptOneDie("Repair D12", (d) =>
                  sendCommand("action", { name: rig.name, action: "repair", loc: state.loc, dice: { repair: d } }),
                );
              }
            },
          },
        ],
      });
      })();
    },
    [openDrawer, closeDrawer, sendCommand, promptOneDie, guardAction],
  );

  const openPrepare = useCallback(
    (rig: Rig) => {
      void (async () => {
      if (!(await guardAction("action", { name: rig.name, action: "prepare" }))) return;
      const state: { prep: PrepType } = { prep: "brace" };
      const build = () => (
        <PrepareBody
          rigName={rig.name}
          allowShield={rig.weapons?.melee === "Bulwark Shield"}
          onChange={(v) => (state.prep = v)}
          onConfirm={() => {
            closeDrawer();
            sendCommand("action", { name: rig.name, action: "prepare", prep: state.prep });
          }}
        />
      );
      openDrawer({
        title: `🛡️ Prepare — ${rig.name}`,
        tone: "oil",
        render: build,
        actions: [
          { label: "Cancel", ghost: true, onClick: () => closeDrawer() },
        ],
      });
      })();
    },
    [openDrawer, closeDrawer, sendCommand, guardAction],
  );

  const openSupport = useCallback(
    (rig: Rig, action: string) => {
      void (async () => {
      const meta = SUPPORT_META[action];
      if (!meta) return;
      const pool = (rigsRef.current || []).filter((r) => !r.destroyed);
      // Paint marks an enemy; Field Weld/Vent reach a friendly — "self or ally"
      // per spec, so the acting unit stays in its own target list. Vent only
      // helps a heat-tracking kind (a Rig — Tanks/Walkers run cold).
      const targets = action === "paint"
        ? pool.filter((r) => (r.owner || "a") !== (rig.owner || "a"))
        : pool.filter(
            (r) => (r.owner || "a") === (rig.owner || "a")
              && (action !== "vent" || UNIT_KINDS[kindOf(r)]?.hasHeat),
          );
      if (!targets.length) return;
      // Preflight with the first candidate target so the module/turn gate is
      // checked while a real target still satisfies the target guard — the player
      // refines the actual target in the wizard.
      if (!(await guardAction("action", { name: rig.name, action, target: targets[0].name }))) return;

      const state: { target: string; loc: string } = {
        target: targets[0].name,
        loc: partNamesOf(kindOf(targets[0]))[0] || "hull",
      };

      openDrawer({
        title: `${meta.icon} ${meta.title} — ${rig.name}`,
        tone: "cool",
        render: () => (
          <SupportBody
            targets={targets}
            needsLoc={meta.needsLoc}
            onChange={(v) => {
              state.target = v.target;
              if (v.loc) state.loc = v.loc;
            }}
          />
        ),
        actions: [
          { label: "Cancel", ghost: true, onClick: () => closeDrawer() },
          {
            label: meta.label,
            primary: true,
            icon: meta.icon,
            onClick: () => {
              closeDrawer();
              const attrs: Record<string, unknown> = { name: rig.name, action, target: state.target };
              if (meta.needsLoc) attrs.loc = state.loc;
              sendCommand("action", attrs);
            },
          },
        ],
      });
      })();
    },
    [openDrawer, closeDrawer, sendCommand, guardAction],
  );

  const sendReact = useCallback(
    (attrs: Record<string, unknown>) => sendCommand("react", { ...attrs, side: mySide() }),
    [sendCommand, mySide],
  );

  const resolveBlast = useCallback(() => {
    const sourceId = (gameRef.current?.pendingBlast as { sourceId?: number } | null)?.sourceId;
    // Every living Rig is a candidate — the controller ticks those within 4"
    // of the wreck. Exclude the exploding wreck itself.
    const candidates = (rigsRef.current || []).filter(
      (r) => !r.destroyed && r.id !== sourceId,
    );
    if (!candidates.length) {
      sendCommand("blast", { targets: [] });
      return;
    }
    const picked = new Set<string>();
    openDrawer({
      title: '💥 Resolve blast — mark Rigs within 4"',
      tone: "ember",
      render: () => <BlastBody candidates={candidates} picked={picked} />,
      actions: [
        { label: "None", ghost: true, onClick: () => { closeDrawer(); sendCommand("blast", { targets: [] }); } },
        {
          label: "Resolve blast",
          primary: true,
          icon: "💥",
          onClick: () => {
            closeDrawer();
            sendCommand("blast", { targets: [...picked] });
          },
        },
      ],
    });
  }, [openDrawer, closeDrawer, sendCommand]);

  const endActivation = useCallback(
    (rig: Rig) => {
      const auto = gameRef.current?.autoResolve;
      const meterOver = rig.engine.heat > (HEAT_CAPACITY[rig.weightClass] ?? 5);
      if (auto || !meterOver) {
        sendCommand("endactivation", { name: rig.name });
      } else {
        promptOneDie("Overheat D12", (d) =>
          sendCommand("endactivation", { name: rig.name, dice: { overheat: d } }),
        );
      }
    },
    [sendCommand, promptOneDie],
  );

  const rollInitiative = useCallback(() => {
    if (gameRef.current?.autoResolve) {
      sendCommand("initiative", {});
    } else {
      promptTwoDice("Initiative D12", (a, b) => sendCommand("initiative", { dice: { a, b } }));
    }
  }, [sendCommand, promptTwoDice]);

  const resetBattle = useCallback(() => {
    sendCommand("reset", {});
  }, [sendCommand]);

  return (
    <Ctx.Provider
      value={{
        openMove, openRepair, openPrepare, openSupport, resolveBlast, sendReact, endActivation, rollInitiative, resetBattle,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useV2BattleActions(): BattleActionsApi {
  const v = useContext(Ctx);
  if (!v) throw new Error("useV2BattleActions outside V2BattleActionsProvider");
  return v;
}
