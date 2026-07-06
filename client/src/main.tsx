import "./styles/tokens.css";
import "./styles/app.css";
import "./styles/rig-sheet.css";
import "./styles/battle.css";
import "./styles/join.css";
import "./styles/glossary.css";
import "./styles/rig-wizard.css";
import "./styles/vp-wizard.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { AppProviders } from "./AppProviders";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppProviders>
      <App />
    </AppProviders>
  </StrictMode>,
);
