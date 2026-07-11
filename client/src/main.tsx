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
import App from "./App";
import { AppProviders } from "./AppProviders";
import { shouldUseV2 } from "./v2/shouldUseV2";
import { V2Boot } from "./v2/V2Boot";

// V2 loads as one lazy chunk (behind V2Boot's Suspense + error boundary), so
// default (no ?v2) users never download it and a stale chunk can never black-screen
// the entry. V1 keeps its own AppProviders, untouched.
const useV2 = shouldUseV2(window.location.search);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {useV2 ? (
      <V2Boot />
    ) : (
      <AppProviders>
        <App />
      </AppProviders>
    )}
  </StrictMode>,
);
