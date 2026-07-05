import { Topbar } from "./Topbar";
import { Stage } from "./Stage";

export function Terminal() {
  return (
    <div className="term">
      <Topbar />
      <Stage />
      {/* ChatFab + ChatPanel mount here (Task 34) */}
    </div>
  );
}
