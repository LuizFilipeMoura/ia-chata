import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useDrawer } from "./DrawerContext";
import { useRoll } from "./RollContext";
import { useRoomState } from "./RoomStateContext";
import { useCommands } from "../hooks/useCommands";
import ChoiceField from "../components/overlays/ChoiceField";
import type { Rig } from "./types";

// A glyph per action so the console reads at a glance instead of as a wall of
// text (battle.js:11-16).
const ACTION_ICONS: Record<string, string> = {
  move: "🦿", sprint: "💨", fire: "🎯", aimed: "◎", ram: "💥",
  reload: "🔄", repair: "🔧", prepare: "🛡️", shutdown: "⏻",
  harden: "🧱", purge: "❄️", jumpjets: "🚀", overclock: "⚡", emergencypatch: "🩹",
};
const iconFor = (key: string) => ACTION_ICONS[key] || "⚙️";

const LOC_CHOICES = [
  { value: "hull", label: "Hull", icon: "🛡️" },
  { value: "arms", label: "Arms", icon: "🦾" },
  { value: "legs", label: "Legs", icon: "🦿" },
  { value: "engine", label: "Engine", icon: "🔩" },
];

// §5 base Speed (inches) per weight class — the physical reach of a Move.
const SPEED: Record<string, number> = { light: 9, medium: 8, heavy: 6, colossal: 5 };
const MOVE_HOLD_MS = 5000;

const heatCap = (rig: Rig): number =>
  ({ light: 6, medium: 5, heavy: 4, colossal: 3 } as Record<string, number>)[rig.weightClass] ?? 5;

interface BattleActionsApi {
  openMove: (rig: Rig, key: string) => void;
  openRepair: (rig: Rig, action: string) => void;
  scoreVp: () => void;
  resolveBlast: () => void;
  endActivation: (rig: Rig) => void;
  rollInitiative: () => void;
}

const Ctx = createContext<BattleActionsApi | null>(null);

// Move and Sprint resolve on the tabletop, not on the device — the console can't
// see the model shift. So instead of firing the action the instant it's tapped,
// we hold the player on a timed drawer: the Confirm button stays locked for
// MOVE_HOLD_MS (long enough to actually push the Rig) before it unlocks. Cancel
// is live the whole time so a misclick isn't a trap (battle.js:349-426).
function MoveBody({
  rig, actionKey, onCancel, onConfirm,
}: {
  rig: Rig;
  actionKey: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const sprint = actionKey === "sprint";
  const base = SPEED[rig.weightClass] ?? 8;
  const dist = sprint ? base * 1.5 : base;
  const heat = sprint ? (rig.equipment === "servo-actuators" ? 1 : 2) : 1;
  const holdSec = Math.round(MOVE_HOLD_MS / 1000);

  const [remaining, setRemaining] = useState(holdSec);
  const [pct, setPct] = useState(0);
  const done = remaining <= 0;

  useEffect(() => {
    const start = performance.now();
    const timer = window.setInterval(() => {
      const elapsed = performance.now() - start;
      setPct(Math.min(1, elapsed / MOVE_HOLD_MS) * 100);
      if (elapsed >= MOVE_HOLD_MS) {
        setRemaining(0);
      } else {
        setRemaining(Math.ceil((MOVE_HOLD_MS - elapsed) / 1000));
      }
    }, 100);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <>
      <p
        className="dwr-hint"
        dangerouslySetInnerHTML={{
          __html: sprint
            ? `Reposition up to <b>${dist}"</b> (1½× Speed). Backpedal / side-step at half. Generates <b>+${heat} heat</b>.`
            : `Reposition up to <b>${dist}"</b> (full Speed). Backpedal / side-step at half; pivot up to 90° free. Generates <b>+${heat} heat</b>.`,
        }}
      />
      <p className="dwr-hint dwr-move-call">Move the Rig on the table now, then confirm.</p>
      <div className="dwr-hold-track">
        <div className="dwr-hold-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="dwr-actions">
        <button type="button" className="dwr-btn ghost" onClick={onCancel}>
          <span>Cancel</span>
        </button>
        <button type="button" className="dwr-btn primary" disabled={!done} onClick={onConfirm}>
          <span>{done ? "Done — moved" : `Moving… ${remaining}s`}</span>
        </button>
      </div>
    </>
  );
}

export function BattleActionsProvider({ children }: { children: ReactNode }) {
  const { openDrawer, closeDrawer } = useDrawer();
  const { promptDice } = useRoll();
  const sendCommand = useCommands();
  const { game, session } = useRoomState();

  // Keep game/session current inside stable callbacks without recreating them.
  const gameRef = useRef(game);
  const sessionRef = useRef(session);
  gameRef.current = game;
  sessionRef.current = session;

  const mySide = useCallback(() => sessionRef.current?.side || "a", []);

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
      openDrawer({
        title: `${iconFor(key)} ${sprint ? "Sprint" : "Move"} — ${rig.name}`,
        tone: "oil",
        dismissable: false,
        render: () => (
          <MoveBody
            rig={rig}
            actionKey={key}
            onCancel={() => closeDrawer()}
            onConfirm={() => {
              closeDrawer();
              sendCommand("action", { name: rig.name, action: key });
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

  const scoreVp = useCallback(() => {
    const pts = window.prompt("Victory points scored this Recovery (centre 2, each corner 1):", "0");
    if (pts == null) return;
    sendCommand("vp", { side: mySide(), points: String(parseInt(pts, 10) || 0) });
  }, [sendCommand, mySide]);

  const resolveBlast = useCallback(() => {
    const names = window.prompt('Names of rigs within 12" (comma-separated):', "");
    if (names == null) return;
    const targets = names.split(",").map((s) => s.trim()).filter(Boolean);
    sendCommand("blast", { targets });
  }, [sendCommand]);

  const endActivation = useCallback(
    (rig: Rig) => {
      const auto = gameRef.current?.autoResolve;
      const meterOver = rig.engine.heat > heatCap(rig);
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

  return (
    <Ctx.Provider
      value={{ openMove, openRepair, scoreVp, resolveBlast, endActivation, rollInitiative }}
    >
      {children}
    </Ctx.Provider>
  );
}

// Location picker for the two repair-family actions (battle.js:430-461).
function RepairBody({
  isPatch, auto, onChange,
}: {
  isPatch: boolean;
  auto: boolean;
  onChange: (v: string) => void;
}) {
  const [loc, setLoc] = useState("hull");
  return (
    <>
      <p className="dwr-hint">
        {isPatch
          ? "Restores a guaranteed 2 SP to the chosen location — no dice."
          : auto
            ? "Rolls a D12: 10+ restores 2 SP, 7–9 restores 1 SP."
            : "You'll roll a D12 next: 10+ restores 2 SP, 7–9 restores 1 SP."}
      </p>
      <ChoiceField
        label="Location"
        options={LOC_CHOICES}
        value={loc}
        onChange={(v) => {
          setLoc(v);
          onChange(v);
        }}
      />
    </>
  );
}

export function useBattleActions(): BattleActionsApi {
  const v = useContext(Ctx);
  if (!v) throw new Error("useBattleActions outside BattleActionsProvider");
  return v;
}

export { iconFor, ACTION_ICONS };
