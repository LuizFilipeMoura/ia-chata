import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import Drawer, { type DrawerConfig } from "../overlays/Drawer";

interface DrawerApi {
  openDrawer: (config: DrawerConfig) => void;
  closeDrawer: () => void;
}

const Ctx = createContext<DrawerApi | null>(null);

export function V2DrawerProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<DrawerConfig | null>(null);
  const [visible, setVisible] = useState(false);
  const hideTimer = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  const closeDrawer = useCallback(() => {
    setVisible(false);
    if (hideTimer.current != null) clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => {
      setConfig(null);
      hideTimer.current = null;
    }, 250);
  }, []);

  const openDrawer = useCallback((next: DrawerConfig) => {
    // Opening a new drawer replaces the current one immediately.
    if (hideTimer.current != null) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
    setVisible(false);
    setConfig(next);
  }, []);

  // Mount without `show`, then add `show` on the next frame (mirrors V1's
  // `void scrim.offsetWidth; scrim.classList.add("show")` fade/slide-in).
  useEffect(() => {
    if (config && !visible) {
      rafRef.current = requestAnimationFrame(() => setVisible(true));
      return () => {
        if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      };
    }
  }, [config, visible]);

  useEffect(() => {
    return () => {
      if (hideTimer.current != null) clearTimeout(hideTimer.current);
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <Ctx.Provider value={{ openDrawer, closeDrawer }}>
      {children}
      {config
        ? createPortal(
            <Drawer config={config} visible={visible} onClose={closeDrawer} />,
            document.body,
          )
        : null}
    </Ctx.Provider>
  );
}

export function useV2Drawer(): DrawerApi {
  const v = useContext(Ctx);
  if (!v) throw new Error("useV2Drawer outside V2DrawerProvider");
  return v;
}
