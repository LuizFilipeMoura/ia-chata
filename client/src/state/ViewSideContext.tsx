import { createContext } from "react";

/** When set, overrides the session's side for the subtree — used by the /test
 *  split view to render one side's perspective per column. Undefined in the
 *  normal app, so consumers fall back to session.side. */
export const ViewSideContext = createContext<string | undefined>(undefined);
