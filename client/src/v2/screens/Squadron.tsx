import "../styles/squadron.css";
import { canAddRigForSide } from "/shared/game-state.js";
import { useRoomState } from "../../state/RoomStateContext";
import { useCommands } from "../../hooks/useCommands";
import { useMySide } from "../../hooks/useMySide";
import { orderedRigs } from "../../lib/rigView";
import { commissioned, tonnage } from "../lib/viewModels";
import { RigRow } from "../components/RigRow";

export function Squadron({ onOpenRig, onCommission }: { onOpenRig: (id: number) => void; onCommission: () => void }) {
  const { rigs, game, field } = useRoomState();
  const sendCommand = useCommands();
  const mySide = useMySide();
  const enemySide = mySide === "a" ? "b" : "a";

  const ordered = orderedRigs(rigs, mySide);
  const mine = ordered.filter((r) => (r.owner || "a") === mySide);
  const foes = ordered.filter((r) => (r.owner || "a") === enemySide);
  const { count, max } = commissioned(rigs, mySide);
  const canAdd = canAddRigForSide({ rigs, game }, mySide);

  const started = Boolean(game?.started);
  const auto = game?.autoResolve !== false;
  const sideName = (id: string) => game?.sides?.find((s) => s.id === id)?.name || (id === "a" ? "Side A" : "Side B");
  const sideReady = (id: string) => Boolean(game?.sides?.find((s) => s.id === id)?.ready);
  const myReady = sideReady(mySide);
  const readyDisabled = started || myReady || count < max || !field?.locked;

  return (
    <section className="v2-yard">
      <div className="v2-yard-head">
        <div>
          <div className="v2-yard-eyebrow">DEPOT ROSTER</div>
          <h1 className="v2-yard-title">THE YARD</h1>
        </div>
        <div className="v2-yard-stats">
          <div className="v2-yard-count">{count} / {max} COMMISSIONED</div>
          <div className="v2-yard-tons">TONNAGE · {tonnage(rigs, mySide)} T</div>
        </div>
      </div>

      <div className="v2-yard-band v2-yard-band--own">
        <span className="v2-yard-band-dot" /><span>YOUR SQUADRON</span><span className="v2-yard-band-rule" />
      </div>
      <div className="v2-yard-list">
        {mine.map((r) => <RigRow key={r.id} rig={r} hostile={false} onOpen={onOpenRig} />)}
      </div>

      {foes.length > 0 && (
        <>
          <div className="v2-yard-band v2-yard-band--foe">
            <span className="v2-yard-band-dot" /><span>HOSTILE FORCES</span><span className="v2-yard-band-rule" />
          </div>
          <div className="v2-yard-list">
            {foes.map((r) => <RigRow key={r.id} rig={r} hostile onOpen={onOpenRig} />)}
          </div>
        </>
      )}

      {!started && (
        <button type="button" className="v2-yard-add" disabled={!canAdd}
          onClick={() => canAdd && onCommission()}>
          <span className="v2-yard-add-plus">＋</span>
          {canAdd ? "Commission New Rig" : "Roster full — ready up"}
        </button>
      )}

      {!started && (
        <div className="v2-yard-ready">
          <div className="v2-yard-ready-txt">
            <div className="v2-yard-ready-line">
              {sideName(mySide)} {myReady ? "READY" : "NOT READY"} · {sideName(enemySide)} {sideReady(enemySide) ? "READY" : "NOT READY"}
            </div>
            <div className="v2-yard-ready-sub">
              {!field?.locked ? "Owner must lock the field before you can ready up."
                : count < max ? `Choose ${max - count} more Rig${max - count === 1 ? "" : "s"} to ready up.`
                : "Tap any Rig to open its Control Terminal."}
            </div>
          </div>
          <button type="button" className="v2-yard-dice" aria-pressed={auto} disabled={started}
            onClick={() => sendCommand("setdice", { value: auto ? "manual" : "auto" })}>
            🎲 {auto ? "AUTO" : "MANUAL"}
          </button>
          <button type="button" className="v2-yard-readybtn" disabled={readyDisabled}
            onClick={() => sendCommand("ready", { side: mySide })}>
            READY
          </button>
        </div>
      )}
    </section>
  );
}
