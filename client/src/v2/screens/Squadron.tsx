import "../styles/squadron.css";
import { BOT_PRESETS } from "/shared/game-state.js";
import { useRoomState } from "../../state/RoomStateContext";
import { useCommands } from "../../hooks/useCommands";
import { useMySide } from "../../hooks/useMySide";
import { orderedRigs } from "../../lib/rigView";
import { squadronStatus, tonnage } from "../lib/viewModels";
import { RigRow } from "../components/RigRow";
import { BattleHud } from "../components/BattleHud";
import { FieldControls } from "../battle/FieldControls";

export function Squadron({ onOpenRig, onCommission }: { onOpenRig: (id: number) => void; onCommission: () => void }) {
  const { rigs, game, field } = useRoomState();
  const sendCommand = useCommands();
  const mySide = useMySide();
  const enemySide = mySide === "a" ? "b" : "a";
  const enemyBot = game?.sides?.find((s) => s.id === enemySide)?.bot ?? null;

  const ordered = orderedRigs(rigs, mySide);
  const mine = ordered.filter((r) => (r.owner || "a") === mySide);
  const foes = ordered.filter((r) => (r.owner || "a") === enemySide);
  const { count, atParity, diffLabel } = squadronStatus(rigs, mySide);

  const started = Boolean(game?.started);
  const activeId = started && game?.phase === "activation" ? (game?.turn?.activeRigId ?? null) : null;
  const auto = game?.autoResolve !== false;
  const sideName = (id: string) => game?.sides?.find((s) => s.id === id)?.name || (id === "a" ? "Side A" : "Side B");
  const sideReady = (id: string) => Boolean(game?.sides?.find((s) => s.id === id)?.ready);
  const myReady = sideReady(mySide);
  // A bot opponent is generated server-side on ready, so its side needn't be at
  // parity yet — gate on your own roster being non-empty and the field locked.
  const rosterReady = enemyBot ? count >= 1 : atParity;
  const readyDisabled = started || myReady || !rosterReady || !field?.locked;

  return (
    <section className="v2-yard">
      <BattleHud />
      <div className="v2-yard-head">
        <div>
          <div className="v2-yard-eyebrow v2-eyebrow">DEPOT ROSTER</div>
          <h1 className="v2-yard-title v2-title">THE YARD</h1>
        </div>
        <div className="v2-yard-stats">
          <div className="v2-yard-count">{count} COMMISSIONED{!started && !atParity && !enemyBot && diffLabel ? ` · ${diffLabel}` : ""}</div>
          <div className="v2-yard-tons">TONNAGE · {tonnage(rigs, mySide)} T</div>
        </div>
      </div>

      <div className="v2-yard-band v2-yard-band--own">
        <span className="v2-yard-band-dot" /><span>YOUR SQUADRON</span><span className="v2-yard-band-rule" />
      </div>
      <div className="v2-yard-list">
        {mine.map((r) => <RigRow key={r.id} rig={r} hostile={false} active={r.id === activeId} onOpen={onOpenRig} />)}
      </div>

      {foes.length > 0 && (
        <>
          <div className="v2-yard-band v2-yard-band--foe">
            <span className="v2-yard-band-dot" /><span>HOSTILE FORCES</span><span className="v2-yard-band-rule" />
          </div>
          <div className="v2-yard-list">
            {foes.map((r) => <RigRow key={r.id} rig={r} hostile target={r.id === game?.priorityTargets?.[mySide]} active={r.id === activeId} onOpen={onOpenRig} />)}
          </div>
        </>
      )}

      {/* Battlefield: shown pre-battle too — the owner sets & locks the field here
          (a prerequisite to readying up), matching V1. FieldControls self-gates. */}
      <FieldControls />

      {!started && (
        <button type="button" className="v2-yard-add" onClick={() => onCommission()}>
          <span className="v2-yard-add-plus">＋</span>
          Commission New Rig
        </button>
      )}

      {!started && (
        <div className="v2-yard-opponent">
          <span className="v2-yard-opponent-label v2-eyebrow">OPPONENT</span>
          <div className="v2-yard-opponent-opts" role="group" aria-label="Opponent">
            <button
              type="button"
              className={"v2-yard-opp-btn" + (!enemyBot ? " is-on" : "")}
              aria-pressed={!enemyBot}
              onClick={() => sendCommand("setbot", { side: enemySide, preset: null })}
            >
              Human
            </button>
            {BOT_PRESETS.map((preset: string) => (
              <button
                key={preset}
                type="button"
                className={"v2-yard-opp-btn" + (enemyBot === preset ? " is-on" : "")}
                aria-pressed={enemyBot === preset}
                onClick={() => sendCommand("setbot", { side: enemySide, preset })}
              >
                {preset.charAt(0).toUpperCase() + preset.slice(1)} Bot
              </button>
            ))}
          </div>
          <div className="v2-yard-opponent-sub">
            {enemyBot
              ? "The bot mirrors your force at a random Standard loadout. Difficulty is the preset."
              : "Two-player: your opponent joins and commissions their own squadron."}
          </div>
        </div>
      )}

      {!started && (
        <div className="v2-yard-ready">
          <div className="v2-yard-ready-txt">
            <div className="v2-yard-ready-line">
              {sideName(mySide)} {myReady ? "READY" : "NOT READY"} · {sideName(enemySide)} {sideReady(enemySide) ? "READY" : "NOT READY"}
            </div>
            <div className="v2-yard-ready-sub">
              {!field?.locked ? "Owner must lock the field before you can ready up."
                : (!enemyBot && !atParity) ? (diffLabel ?? "Match your opponent's composition to ready up.")
                : "Tap any Rig to open its Control Terminal."}
            </div>
          </div>
          <button type="button" className="v2-yard-dice" aria-pressed={auto} disabled={started}
            onClick={() => sendCommand("setdice", { value: auto ? "manual" : "auto" })}>
            🎲 {auto ? "AUTO" : "MANUAL"}
          </button>
          <button type="button" className="v2-yard-readybtn v2-cta" disabled={readyDisabled}
            onClick={() => sendCommand("ready", { side: mySide })}>
            READY
          </button>
        </div>
      )}
    </section>
  );
}
