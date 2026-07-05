import { useEffect } from "react";

/** Track visualViewport height into --app-h so the dock stays above the keyboard. */
export function useViewportHeight(): void {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const sync = () => {
      const h = vv.height;
      if (!h || h < 1) return;
      document.documentElement.style.setProperty("--app-h", `${h}px`);
    };
    vv.addEventListener("resize", sync);
    vv.addEventListener("scroll", sync);
    sync();
    return () => {
      vv.removeEventListener("resize", sync);
      vv.removeEventListener("scroll", sync);
    };
  }, []);
}
