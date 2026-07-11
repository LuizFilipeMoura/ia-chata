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
import V2App from "./v2/V2App";

const Root = shouldUseV2(window.location.search) ? V2App : App;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppProviders>
      <Root />
    </AppProviders>
  </StrictMode>,
);
