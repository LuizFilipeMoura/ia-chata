import {
  createContext,
  useContext,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import { HEAT_CAPACITY } from "/shared/game-state.js";
import { useV2Drawer } from "./V2DrawerContext";
import { useV2Roll } from "./V2RollContext";
import { useRoomState } from "../../state/RoomStateContext";
import { useV2Commands } from "../hooks/useV2Commands";
import { useMySide } from "../../hooks/useMySide";
import MoveBody from "../battle/MoveBody";
import RepairBody from "../battle/RepairBody";
import PrepareBody from "../battle/PrepareBody";
import BlastBody from "../battle/BlastBody";
import { iconFor } from "../battle/constants";
import type { Rig, PrepType } from "../../state/types";

interface BattleActionsApi {
  openMove: (rig: Rig, key: string) => void;
  openRepair: (rig: Rig, action: string) => void;
  openPrepare: (rig: Rig) => void;
  resolveBlast: () => void;
  sendReact: (attrs: Record<string, unknown>) => void;
  endActivation: (rig: Rig) => void;
  rollInitiative: () => void;
  resetBattle: () => void;
}

const Ctx = createContext<BattleActionsApi | null>(null);

// Native V2 port of V1's BattleActionsProvider. Same API and command dispatches;
// it drives the V2 drawer/roll primitives (useV2Drawer / useV2Roll) instead of
// the V1 ones.
export function V2BattleActionsProvider({ children }: { children: ReactNode }) {
  const { openDrawer, closeDrawer } = useV2Drawer();
  const { promptDice } = useV2Roll();
  const sendCommand = useV2Commands();
  const { game, rigs } = useRoomState();

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
    },
    [openDrawer, closeDrawer, sendCommand],
  );

  const openRepair = useCallback(
    (rig: Rig, action: string) => {
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
    },
    [openDrawer, closeDrawer, sendCommand, promptOneDie],
  );

  const openPrepare = useCallback(
    (rig: Rig) => {
      const state: { prep: PrepType } = { prep: "brace" };
      const build = () => (
        <PrepareBody
          rigName={rig.name}
          allowShield={rig.weapons?.melee === "Bulwark Shield"}
          onChange={(v) => (state.prep = v)}
        />
      );
      openDrawer({
        title: `🛡️ Prepare — ${rig.name}`,
        tone: "oil",
        render: build,
        actions: [
          { label: "Cancel", ghost: true, onClick: () => closeDrawer() },
          {
            label: "Set reaction",
            primary: true,
            icon: "🛡️",
            onClick: () => {
              closeDrawer();
              sendCommand("action", { name: rig.name, action: "prepare", prep: state.prep });
            },
          },
        ],
      });
    },
    [openDrawer, closeDrawer, sendCommand],
  );

  const sendReact = useCallback(
    (attrs: Record<string, unknown>) => sendCommand("react", { ...attrs, side: mySide() }),
    [sendCommand, mySide],
  );

  const resolveBlast = useCallback(() => {
    const sourceId = (gameRef.current?.pendingBlast as { sourceId?: number } | null)?.sourceId;
    // Every living Rig is a candidate — the controller ticks those within 12"
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
      title: '💥 Resolve blast — mark Rigs within 12"',
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
        openMove, openRepair, openPrepare, resolveBlast, sendReact, endActivation, rollInitiative, resetBattle,
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
