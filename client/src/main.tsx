import "./styles/tokens.css";
import "./styles/app.css";
import "./styles/rig-sheet.css";
import "./styles/battle.css";
import "./styles/join.css";
import "./styles/glossary.css";
import "./styles/rig-wizard.css";
import "./styles/vp-wizard.css";
import "./styles/dieselpunk.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { V2Boot } from "./v2/V2Boot";

// V2 is the only frontend. V1 (App/AppProviders) is retired and no longer reachable
// from the entry point regardless of query flags. V2 loads as one lazy chunk behind
// V2Boot's Suspense + error boundary so a stale chunk can never black-screen the entry.
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <V2Boot />
  </StrictMode>,
);
