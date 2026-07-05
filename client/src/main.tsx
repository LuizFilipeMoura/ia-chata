import "./styles/tokens.css";
import "./styles/app.css";
import "./styles/rig-sheet.css";
import "./styles/battle.css";
import "./styles/join.css";
import "./styles/glossary.css";
import "./styles/rig-wizard.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { RoomProvider } from "./state/RoomStateContext";
import { UiProvider } from "./state/UiStateContext";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RoomProvider>
      <UiProvider>
        <App />
      </UiProvider>
    </RoomProvider>
  </StrictMode>,
);
