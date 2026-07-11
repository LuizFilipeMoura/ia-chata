import { Component, Suspense, lazy, type ReactNode } from "react";

// V2 is one lazy chunk (own provider stack + app) so default (no ?v2) users never
// download it. But a lazy entry point must never fail into a blank screen: a stale
// dynamic-import hash (common after a dev server restart or heavy HMR churn) makes
// the import reject. So we render a visible loading fallback and wrap the lazy tree
// in an error boundary that recovers a stale chunk by reloading once.
const V2Root = lazy(() => import("./V2Root"));

const SCREEN: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexDirection: "column",
  gap: 14,
  background: "#080a0d",
  color: "#e79a3d",
  fontFamily: '"Oswald", system-ui, sans-serif',
  letterSpacing: ".2em",
  textTransform: "uppercase",
  fontSize: 13,
};

function Loading() {
  return (
    <div style={SCREEN} aria-live="polite">
      <div>◈ Oil &amp; Iron</div>
      <div style={{ color: "#7b8593", fontSize: 10 }}>Spinning up the terminal…</div>
    </div>
  );
}

interface BoundaryState {
  failed: boolean;
}

class V2ErrorBoundary extends Component<{ children: ReactNode }, BoundaryState> {
  private reloadKey = "v2-chunk-reload";
  state: BoundaryState = { failed: false };

  static getDerivedStateFromError(): BoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    // A failed dynamic import (stale chunk) is recoverable by a full reload, which
    // refetches the current bundle. Reload at most once so a genuine render bug
    // doesn't loop — the guard is cleared on any successful boot (below).
    const msg = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    const isChunkError = /dynamically imported module|Importing a module|Failed to fetch|ChunkLoadError|error loading/i.test(msg);
    if (isChunkError && !sessionStorage.getItem(this.reloadKey)) {
      sessionStorage.setItem(this.reloadKey, "1");
      window.location.reload();
    }
  }

  render() {
    if (this.state.failed) {
      return (
        <div style={SCREEN}>
          <div>◈ Oil &amp; Iron</div>
          <div style={{ color: "#7b8593", fontSize: 10 }}>Terminal failed to load.</div>
          <button
            type="button"
            onClick={() => { sessionStorage.removeItem(this.reloadKey); window.location.reload(); }}
            style={{
              marginTop: 6, padding: "10px 18px", cursor: "pointer",
              background: "linear-gradient(180deg,#f0a94a,#c47a26)", border: "1px solid #ffcf82",
              color: "#1a1206", fontFamily: '"Oswald", system-ui, sans-serif',
              fontWeight: 700, letterSpacing: ".14em", textTransform: "uppercase",
            }}
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// Clears the one-shot reload guard once the app mounts successfully.
function ClearReloadGuard() {
  sessionStorage.removeItem("v2-chunk-reload");
  return null;
}

export function V2Boot() {
  return (
    <V2ErrorBoundary>
      <Suspense fallback={<Loading />}>
        <ClearReloadGuard />
        <V2Root />
      </Suspense>
    </V2ErrorBoundary>
  );
}
