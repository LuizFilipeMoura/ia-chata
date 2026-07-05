import { Topbar } from "./Topbar";
import { Stage } from "./Stage";
import { OutcomeBanner } from "./OutcomeBanner";
import { TurnBanner } from "./TurnBanner";
import { useBattleWatchers } from "../hooks/useBattleWatchers";

export function Terminal() {
  useBattleWatchers();
  return (
    <>
      <TurnBanner />
      <div className="term">
        <Topbar />
        <Stage />
        <OutcomeBanner />
        {/* ChatFab + ChatPanel mount here (Task 34) */}
      </div>
    </>
  );
}
