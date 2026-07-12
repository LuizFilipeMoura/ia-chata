import { useEffect, useRef, useState } from "react";
import { useRoomState } from "../../state/RoomStateContext";
import { useMySide } from "../../hooks/useMySide";
import { useBattleAudio } from "../audio/useBattleAudio";
import { phaseSummary } from "/shared/battle-view.js";
import "../styles/battle.css";

export function BattleHud() {
  const { rigs, game } = useRoomState();
  const mySide = useMySide();
  const audio = useBattleAudio();
  const [toast, setToast] = useState<string | null>(null);
  const lastKillId = useRef(0);
  const killSeeded = useRef(false);
  const toastTimer = useRef<number | null>(null);
  useEffect(() => {
    const log = game?.resolutions || [];
    if (!killSeeded.current) {
      killSeeded.current = true;
      lastKillId.current = log.length ? log[log.length - 1].id : 0;
      return;
    }
    const fresh = log.filter((e) => e.id > lastKillId.current && e.vp);
    if (!fresh.length) return;
    const latest = fresh[fresh.length - 1];
    lastKillId.current = log[log.length - 1].id;
    const scorer = (game?.sides || []).find((s) => s.id === latest.vp!.side);
    setToast(`${scorer?.name ?? "?"} — ${latest.victimName ?? "a unit"} wrecked · +${latest.vp!.amount} VP`);
    if (toastTimer.current != null) clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 4000);
  }, [game?.resolutions]);
  useEffect(() => () => { if (toastTimer.current != null) clearTimeout(toastTimer.current); }, []);
  if (!game?.started) return null;
  const sum = phaseSummary(game, rigs);
  const tok = sum.answerTokens[mySide] || 0;
  const pr = game.pendingReaction;
  const opponentReacting = Boolean(pr && pr.defender !== mySide);
  const sides = game.sides || [];
  const mine = sides.find((s) => s.id === mySide);
  const foe = sides.find((s) => s.id !== mySide);
  return (
    <div className="v2-bh">
      <div className="v2-bh-phase">
        <span className="v2-bh-label v2-title">{sum.label}</span>
        <span className="v2-bh-round">R{sum.round}</span>
      </div>
      <div className="v2-bh-turn">
        {sum.turnSide ? (<>Turn: <b className={sum.turnSide === mySide ? "v2-bh-mine" : "v2-bh-foe"}>{sum.turnName}</b>{sum.activeName ? ` — ${sum.activeName}` : ""}</>) : ""}
      </div>
      <div className="v2-bh-vp">
        {mine && <span className="v2-bh-mine">{mine.name} {mine.vp ?? 0}</span>}
        {mine && foe && <span className="v2-bh-vp-sep"> · </span>}
        {foe && <span className="v2-bh-foe">{foe.name} {foe.vp ?? 0}</span>}
      </div>
      <div className="v2-bh-tokens">{tok ? `⟡ ${tok} Answer` : ""}</div>
      {opponentReacting && <div className="v2-bh-reacting">↩️ Opponent is reacting…</div>}
      {toast && <div className="v2-bh-killtoast" role="status">☠️ {toast}</div>}
      <button
        type="button"
        className="v2-bh-audio"
        aria-label={audio.on ? "Mute battle audio" : "Unmute battle audio"}
        aria-pressed={!audio.on}
        onClick={audio.toggle}
      >
        {audio.on ? "🔊" : "🔇"}
      </button>
    </div>
  );
}
