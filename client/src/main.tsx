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

// V2 is lazy so default (no ?v2) users never download the V2 bundle or its CSS
// (including the remote font @import) — keeping V1's load truly untouched.
const V2App = lazy(() => import("./v2/V2App"));
const useV2 = shouldUseV2(window.location.search);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppProviders>
      {useV2 ? (
        <Suspense fallback={null}>
          <V2App />
        </Suspense>
      ) : (
        <App />
      )}
    </AppProviders>
  </StrictMode>,
);
