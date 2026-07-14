import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { HEAT_CAPACITY, rigEffects } from "/shared/game-state.js";
import { useDrawer } from "./DrawerContext";
import { useRoll } from "./RollContext";
import { useRoomState } from "./RoomStateContext";
import { useCommands } from "../hooks/useCommands";
import { useMySide } from "../hooks/useMySide";
import ChoiceField from "../components/overlays/ChoiceField";
import ReactionPicker from "../components/overlays/ReactionPicker";
import type { Rig, PrepType } from "./types";

// A glyph per action so the console reads at a glance instead of as a wall of
// text (battle.js:11-16).
const ACTION_ICONS: Record<string, string> = {
  move: "👣", sprint: "🏃", fire: "🎯", aimed: "🔭",
  reload: "🔄", repair: "🔧", prepare: "🛡️", shutdown: "⏻", disengage: "🔓",
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
// House-rule tuning: whole-inch speeds so tabletop measuring stays clean.
// Mediums bumped up a notch (were crawling) while keeping the light > medium >
// heavy > colossal ladder.
const SPEED: Record<string, number> = { light: 5, medium: 4, heavy: 3, colossal: 2 };
const MOVE_HOLD_MS = 5000;
const SPRINT_HOLD_MS = 8000;
const holdMsFor = (key: string) => (key === "sprint" ? SPRINT_HOLD_MS : MOVE_HOLD_MS);

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

// Move and Sprint resolve on the tabletop, not on the device — the console can't
// see the model shift. So instead of firing the action the instant it's tapped,
// we hold the player on a timed drawer: the Confirm button stays locked for
// MOVE_HOLD_MS (long enough to actually push the Rig) before it unlocks. Cancel
// is live the whole time so a misclick isn't a trap (battle.js:349-426).
function MoveBody({
  rig, actionKey, enemies, onEngageChange, onCancel, onConfirm,
}: {
  rig: Rig;
  actionKey: string;
  enemies: Rig[];
  onEngageChange: (v: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const sprint = actionKey === "sprint";
  // Per-chassis Speed wins; fall back to the weight-class map for support units,
  // free-combo rigs, and pre-speed saves.
  const base = rig.speed ?? SPEED[rig.weightClass] ?? 8;
  // Sprint reach and heat are both loadout-derived; rigEffects is the one
  // read-model that resolves them (V2's MoveBody reads the same values).
  const eff = rigEffects(rig);
  const mult = eff.sprintMult;
  const dist = sprint ? Math.round(base * mult) : base;
  // The reach label rides the same value as the distance — printing a literal
  // "1½×" next to a 2×-derived number is how "16" (1½× Speed)" ships.
  const reachLabel = mult === 1.5 ? "1½× Speed" : `${mult}× Speed`;
  const heat = sprint ? eff.actionHeat.sprint : 1;
  const holdMs = holdMsFor(actionKey);
  const holdSec = Math.round(holdMs / 1000);

  const [remaining, setRemaining] = useState(holdSec);
  const [pct, setPct] = useState(0);
  const done = remaining <= 0;
  // Move and Sprint each spend one action slot; both generate heat (Move +1,
  // Sprint +2 / +1 with Servo Actuators). Repeat them within the budget.
  const costNote = `Costs 1 action · +${heat} heat`;

  useEffect(() => {
    const start = performance.now();
    const timer = window.setInterval(() => {
      const elapsed = performance.now() - start;
      setPct(Math.min(1, elapsed / holdMs) * 100);
      if (elapsed >= holdMs) {
        setRemaining(0);
      } else {
        setRemaining(Math.ceil((holdMs - elapsed) / 1000));
      }
    }, 100);
    return () => window.clearInterval(timer);
  }, [holdMs]);

  return (
    <>
      <p
        className="dwr-hint"
        dangerouslySetInnerHTML={{
          __html: sprint
            ? `Reposition up to <b>${dist}"</b> (${reachLabel}). Backpedal / side-step at half. Generates <b>+${heat} heat</b>.`
            : `Reposition up to <b>${dist}"</b> (full Speed). Backpedal / side-step at half; pivot up to 90° free. Generates <b>+${heat} heat</b>.`,
        }}
      />
      <div className="dwr-cost">{costNote}</div>
      <div className="dwr-big-wrap">
        <div className={"dwr-big" + (done ? " is-ready" : "")}>{done ? "READY" : `${remaining}s`}</div>
      </div>
      <div className="dwr-hold-track">
        <div className={"dwr-hold-fill" + (done ? " is-ready" : "")} style={{ width: `${pct}%` }} />
      </div>
      <p className={"dwr-hint dwr-move-call" + (done ? " is-ready" : "")}>
        {done ? "✔ Model placed? Confirm to lock in the move." : "Move the Rig on the table now, then confirm."}
      </p>
      {enemies.length > 0 && (
        <label className="dwr-engage">
          <span className="dwr-engage-label">Engage an enemy in reach (optional)</span>
          <select
            className="dwr-engage-select"
            defaultValue=""
            onChange={(e) => onEngageChange(e.target.value)}
          >
            <option value="">— none —</option>
            {enemies.map((e) => (
              <option key={e.id} value={e.name}>{e.name}</option>
            ))}
          </select>
        </label>
      )}
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
        openMove, openRepair, openPrepare, resolveBlast, sendReact, endActivation, rollInitiative, resetBattle,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

// Reaction picker for the Prepare action. Owns the selection in local state so
// the ReactionPicker re-renders on each pick; onChange mirrors it to the drawer's
// ref-backed state for the Confirm handler (matches RepairBody's pattern).
function PrepareBody({
  rigName, allowShield, onChange,
}: {
  rigName: string;
  allowShield: boolean;
  onChange: (v: PrepType) => void;
}) {
  const [prep, setPrep] = useState<PrepType>("brace");
  return (
    <>
      <p className="dwr-hint">
        Place a facedown reaction on {rigName}. It stays secret until an enemy fires on this Rig.
      </p>
      <ReactionPicker
        value={prep}
        allowShield={allowShield}
        onChange={(v) => {
          setPrep(v);
          onChange(v);
        }}
      />
    </>
  );
}

// Checkbox list for blast resolution: the controller ticks the Rigs standing
// within 4" of the wreck. Owns a local version counter so ticking re-renders;
// mirrors each pick into the caller's `picked` Set for the Confirm handler.
function BlastBody({
  candidates, picked,
}: {
  candidates: Rig[];
  picked: Set<string>;
}) {
  const [, force] = useState(0);
  return (
    <>
      <p className="dwr-hint">
        Select every Rig within 4" of the wreck — each takes a D6 + STR 10 blast hit.
      </p>
      <div className="blast-list">
        {candidates.map((r) => {
          const on = picked.has(r.name);
          return (
            <button
              key={r.id}
              type="button"
              className={"blast-opt" + (on ? " sel" : "")}
              aria-pressed={on}
              onClick={() => {
                if (on) picked.delete(r.name);
                else picked.add(r.name);
                force((n) => n + 1);
              }}
            >
              <span className="blast-opt-check" aria-hidden="true">{on ? "☑" : "☐"}</span>
              <span className="blast-opt-name">{r.name}</span>
              <span className="blast-opt-cls">{r.weightClass}</span>
            </button>
          );
        })}
      </div>
    </>
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
