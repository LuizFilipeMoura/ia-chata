import "./styles/tokens.css";
import "./styles/app.css";
import "./styles/rig-sheet.css";
import "./styles/battle.css";
import "./styles/join.css";
import "./styles/glossary.css";
import "./styles/rig-wizard.css";
import "./styles/vp-wizard.css";
import "./styles/dieselpunk.css";
import { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { AppProviders } from "./AppProviders";
import { shouldUseV2 } from "./v2/shouldUseV2";

// V2 is one lazy chunk (its own provider stack + app), so default (no ?v2) users
// never download any V2 code or CSS. V2 runs on V2Providers — it never mounts the
// V1 overlay providers. V1 keeps its own AppProviders, untouched.
const V2Root = lazy(() => import("./v2/V2Root"));
const useV2 = shouldUseV2(window.location.search);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {useV2 ? (
      <Suspense fallback={null}>
        <V2Root />
      </Suspense>
    ) : (
      <AppProviders>
        <App />
      </AppProviders>
    )}
  </StrictMode>,
);
