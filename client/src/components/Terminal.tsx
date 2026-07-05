import { Topbar } from "./Topbar";
import { Stage } from "./Stage";
import { OutcomeBanner } from "./OutcomeBanner";

export function Terminal() {
  return (
    <div className="term">
      <Topbar />
      <Stage />
      <OutcomeBanner />
      {/* ChatFab + ChatPanel mount here (Task 34) */}
    </div>
  );
}
