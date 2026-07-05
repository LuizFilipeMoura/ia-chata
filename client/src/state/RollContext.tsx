import { createContext, useContext, useRef, useCallback, type ReactNode } from "react";
import { createPortal } from "react-dom";
import RollConsole, {
  type RollConsoleHandle,
  type DiceSpec,
} from "../components/overlays/RollConsole";
import type { Resolution } from "./types";

interface RollApi {
  playResolution: (entry: Resolution) => Promise<void>;
  promptDice: (specs: DiceSpec[], title?: string) => Promise<Record<string, number>>;
  closeRoll: () => void;
}

const Ctx = createContext<RollApi | null>(null);

export function RollProvider({ children }: { children: ReactNode }) {
  const handle = useRef<RollConsoleHandle>(null);

  const playResolution = useCallback(
    (entry: Resolution) => handle.current?.playResolution(entry) ?? Promise.resolve(),
    [],
  );
  const promptDice = useCallback(
    (specs: DiceSpec[], title?: string) =>
      handle.current?.promptDice(specs, title) ?? Promise.resolve({}),
    [],
  );
  const closeRoll = useCallback(() => handle.current?.closeRoll(), []);

  return (
    <Ctx.Provider value={{ playResolution, promptDice, closeRoll }}>
      {children}
      {createPortal(<RollConsole ref={handle} />, document.body)}
    </Ctx.Provider>
  );
}

export function useRoll(): RollApi {
  const v = useContext(Ctx);
  if (!v) throw new Error("useRoll outside RollProvider");
  return v;
}
