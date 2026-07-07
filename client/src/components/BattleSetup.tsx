import { useRoomState } from "../state/RoomStateContext";
import { useCommands } from "../hooks/useCommands";
import { useMySide } from "../hooks/useMySide";

export function BattleSetup() {
  const { rigs, game, field } = useRoomState();
  const sendCommand = useCommands();

  const mySide = useMySide();
  const enemySide = mySide === "a" ? "b" : "a";
  const sideName = (id: string) =>
    game?.sides?.find((s) => s.id === id)?.name || (id === "a" ? "Side A" : "Side B");
  const sideReady = (id: string) => Boolean(game?.sides?.find((s) => s.id === id)?.ready);
  const sideRigCount = (id: string) => rigs.filter((rig) => (rig.owner || "a") === id).length;

  const started = Boolean(game?.started);
  const auto = game?.autoResolve !== false;
  const myCount = sideRigCount(mySide);

  let readyStatus: string;
  let bountyText: string;
  let readyDisabled: boolean;
  let readyText: string;

  if (started) {
    const bountyId = game?.bounties?.[mySide];
    const bounty = rigs.find((rig) => rig.id === bountyId);
    readyStatus = "Battle started";
    bountyText = bounty ? `Ironclad Bounty: ${bounty.name}` : "Ironclad Bounty: awaiting target";
    readyDisabled = true;
    readyText = "Started";
  } else {
    const myReady = sideReady(mySide);
    const enemyReady = sideReady(enemySide);
    readyStatus = `${sideName(mySide)} ${myReady ? "Ready" : "Not ready"} · ${sideName(enemySide)} ${enemyReady ? "Ready" : "Not ready"}`;
    bountyText =
      myCount >= 3
        ? "Mark Ready after your final lineup is set."
        : `Choose ${3 - myCount} more Rig${3 - myCount === 1 ? "" : "s"} to ready up.`;
    readyDisabled = myReady || myCount < 3;
    readyText = "Ready";

    if (!field?.locked) {
      readyDisabled = true;
      bountyText = myCount >= 3
        ? "Owner must lock the field before you can ready up."
        : bountyText;
    }
  }

  return (
    <div id="battleSetup" className="battle-setup" aria-live="polite">
      <div>
        <div id="battleReadyStatus" className="battle-ready-status">{readyStatus}</div>
        <div id="battleBounty" className="battle-bounty">{bountyText}</div>
      </div>
      <button
        id="diceMode"
        className="dice-mode"
        type="button"
        aria-pressed={auto}
        title="Auto rolls with animation; Manual lets you enter physical dice"
        disabled={started}
        onClick={() => sendCommand("setdice", { value: auto ? "manual" : "auto" })}
      >
        {auto ? "🎲 Auto" : "🎲 Manual"}
      </button>
      <button
        id="readyBattle"
        className="ready-battle btn btn--primary"
        type="button"
        disabled={readyDisabled}
        onClick={() => sendCommand("ready", { side: mySide })}
      >
        {readyText}
      </button>
    </div>
  );
}
