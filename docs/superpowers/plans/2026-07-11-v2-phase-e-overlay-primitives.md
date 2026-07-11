# V2 Phase E — Overlay Primitives Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** Build the native V2 Drawer + RollConsole primitives and their V2 contexts, as isolated tested units. No app wiring yet (the switchover happens in Phase G once V2BattleActions + V2Wizard exist — the V1 Drawer/Roll/BattleActions/Wizard providers are context-coupled and must swap together).

**Architecture:** V2 mirrors V1's `DrawerContext`/`RollContext` (thin providers portaling one overlay component). Behavior sources: `client/src/components/overlays/Drawer.tsx`, `client/src/components/overlays/RollConsole.tsx`, `client/src/state/DrawerContext.tsx`, `client/src/state/RollContext.tsx`.

**Tech Stack:** React+TS, Vite, Vitest + testing-library.

**Spec:** `docs/superpowers/specs/2026-07-11-v2-phase-e-overlay-primitives-design.md`. **Test cmd:** `npx vitest run <path>` from repo root. Branch `frontend/v2-redesign`. `git add client/src/v2` only.

---

## Task 1: V2 Drawer + V2DrawerContext

**Files:** Create `client/src/v2/overlays/Drawer.tsx`, `client/src/v2/state/V2DrawerContext.tsx`, `client/src/v2/styles/overlay.css`, tests `client/src/v2/state/V2DrawerContext.test.tsx`.

- [ ] **Step 1** — failing test `client/src/v2/state/V2DrawerContext.test.tsx`:
```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { V2DrawerProvider, useV2Drawer } from "./V2DrawerContext";

function Opener({ onClose }: { onClose: () => void }) {
  const { openDrawer } = useV2Drawer();
  return <button onClick={() => openDrawer({ title: "Move", render: () => <p>body</p>,
    actions: [{ label: "Go", primary: true, onClick: onClose }] })}>open</button>;
}
test("opens a drawer with title/body/action and fires the action", async () => {
  const user = userEvent.setup();
  const onClose = vi.fn();
  render(<V2DrawerProvider><Opener onClose={onClose} /></V2DrawerProvider>);
  await user.click(screen.getByText("open"));
  expect(await screen.findByText("Move")).toBeInTheDocument();
  expect(screen.getByText("body")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Go" }));
  expect(onClose).toHaveBeenCalled();
});
```

- [ ] **Step 2** — run → FAIL.
- [ ] **Step 3** — implement `client/src/v2/overlays/Drawer.tsx` (port V1 `Drawer.tsx`, V2 classes `v2-dwr-*`, re-export `DrawerConfig`/`DrawerAction` types):
```tsx
import type { ReactNode } from "react";
export interface DrawerAction { label: string; icon?: string; primary?: boolean; ghost?: boolean; onClick?: () => void; disabled?: boolean; }
export interface DrawerConfig { title: string; tone?: "ember" | "oil" | "cool"; render?: () => ReactNode; actions?: DrawerAction[]; dismissable?: boolean; }
export default function Drawer({ config, visible, onClose }: { config: DrawerConfig; visible: boolean; onClose: () => void }) {
  const dismissable = config.dismissable !== false;
  return (
    <div className={"v2-dwr-scrim" + (visible ? " show" : "")} onClick={(e) => { if (dismissable && e.target === e.currentTarget) onClose(); }}>
      <div className="v2-root"><div className="v2-dwr-card">
        <div className="v2-dwr-title" data-tone={config.tone || "oil"}>{config.title}</div>
        {config.render?.()}
        {config.actions?.length ? (
          <div className="v2-dwr-actions">
            {config.actions.map((a, i) => (
              <button key={i} type="button" className={"v2-dwr-btn" + (a.primary ? " primary" : "") + (a.ghost ? " ghost" : "")}
                disabled={Boolean(a.disabled)} onClick={() => a.onClick?.()}>
                {a.icon ? <span className="v2-dwr-btn-ic">{a.icon}</span> : null}<span>{a.label}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div></div>
    </div>
  );
}
```
Note: the scrim is portaled to `document.body`, so the `.v2-root` wrapper inside is what scopes the styles.

- [ ] **Step 4** — implement `client/src/v2/state/V2DrawerContext.tsx` (port V1 `DrawerContext.tsx` enter/leave logic; import the V2 `Drawer`):
```tsx
import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Drawer, { type DrawerConfig } from "../overlays/Drawer";

interface DrawerApi { openDrawer: (config: DrawerConfig) => void; closeDrawer: () => void; }
const Ctx = createContext<DrawerApi | null>(null);

export function V2DrawerProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<DrawerConfig | null>(null);
  const [visible, setVisible] = useState(false);
  const hideTimer = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const closeDrawer = useCallback(() => {
    setVisible(false);
    if (hideTimer.current != null) clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => { setConfig(null); hideTimer.current = null; }, 250);
  }, []);
  const openDrawer = useCallback((next: DrawerConfig) => {
    if (hideTimer.current != null) { clearTimeout(hideTimer.current); hideTimer.current = null; }
    setVisible(false); setConfig(next);
  }, []);
  useEffect(() => {
    if (config && !visible) { rafRef.current = requestAnimationFrame(() => setVisible(true));
      return () => { if (rafRef.current != null) cancelAnimationFrame(rafRef.current); }; }
  }, [config, visible]);
  useEffect(() => () => { if (hideTimer.current != null) clearTimeout(hideTimer.current); if (rafRef.current != null) cancelAnimationFrame(rafRef.current); }, []);
  return (
    <Ctx.Provider value={{ openDrawer, closeDrawer }}>
      {children}
      {config ? createPortal(<Drawer config={config} visible={visible} onClose={closeDrawer} />, document.body) : null}
    </Ctx.Provider>
  );
}
export function useV2Drawer(): DrawerApi { const v = useContext(Ctx); if (!v) throw new Error("useV2Drawer outside V2DrawerProvider"); return v; }
```

- [ ] **Step 5** — create `client/src/v2/styles/overlay.css` with `.v2-dwr-*` rules under `.v2-root` (bottom-sheet scrim, card, title tones ember/oil/cool, action buttons primary/ghost). Port V1 drawer visuals into the dieselpunk V2 palette.
- [ ] **Step 6** — run test → PASS. `npx tsc -p . --noEmit` clean. isolation test still green.
- [ ] **Step 7** — commit: `git add client/src/v2 && git commit -m "feat(v2): native Drawer + V2DrawerContext"`

---

## Task 2: V2 RollConsole + V2RollContext

**Files:** Create `client/src/v2/overlays/RollConsole.tsx`, `client/src/v2/state/V2RollContext.tsx`, tests `client/src/v2/state/V2RollContext.test.tsx`; append `.v2-roll*` to `overlay.css`.

Port V1 `client/src/components/overlays/RollConsole.tsx` (416 lines — READ it) to V2. Keep the imperative handle (`playResolution`, `promptDice`, `closeRoll`) via `forwardRef`+`useImperativeHandle`, the `DiceSpec` type, dice flicker→settle animation, reaction-token flip reveal, damage-equation breakdown (terms/total/tier/sp/location), effect lines, and the manual-dice entry form. V2 classes `v2-roll-*`. `Resolution`/`DiceSpec` types: reuse `Resolution` from `client/src/state/types`; re-declare `DiceSpec` in the V2 RollConsole.

- [ ] **Step 1** — failing test `client/src/v2/state/V2RollContext.test.tsx`:
```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import { useEffect } from "react";
import { V2RollProvider, useV2Roll } from "./V2RollContext";

function Prompt({ onResult }: { onResult: (v: Record<string, number>) => void }) {
  const { promptDice } = useV2Roll();
  useEffect(() => { promptDice([{ key: "d", label: "Repair D12", sides: 12 }], "Repair").then(onResult); }, [promptDice, onResult]);
  return null;
}
test("promptDice collects a manual die and resolves", async () => {
  const user = userEvent.setup();
  let result: Record<string, number> | null = null;
  render(<V2RollProvider><Prompt onResult={(v) => (result = v)} /></V2RollProvider>);
  const input = await screen.findByLabelText(/Repair D12/i);
  await user.clear(input); await user.type(input, "10");
  await user.click(screen.getByRole("button", { name: /confirm|roll|submit|ok/i }));
  await new Promise((r) => setTimeout(r, 0));
  expect(result).toEqual({ d: 10 });
});
```
(Adjust the confirm-button name + input label to match the V1 RollConsole's manual-entry markup you port.)

- [ ] **Step 2** — run → FAIL.
- [ ] **Step 3** — implement `client/src/v2/overlays/RollConsole.tsx` (port from V1; V2 classes) and `client/src/v2/state/V2RollContext.tsx` (port V1 `RollContext.tsx`, importing the V2 RollConsole; `useV2Roll` hook):
```tsx
// V2RollContext.tsx
import { createContext, useContext, useRef, useCallback, type ReactNode } from "react";
import { createPortal } from "react-dom";
import RollConsole, { type RollConsoleHandle, type DiceSpec } from "../overlays/RollConsole";
import type { Resolution } from "../../state/types";
interface RollApi { playResolution: (e: Resolution) => Promise<void>; promptDice: (specs: DiceSpec[], title?: string) => Promise<Record<string, number>>; closeRoll: () => void; }
const Ctx = createContext<RollApi | null>(null);
export function V2RollProvider({ children }: { children: ReactNode }) {
  const handle = useRef<RollConsoleHandle>(null);
  const playResolution = useCallback((e: Resolution) => handle.current?.playResolution(e) ?? Promise.resolve(), []);
  const promptDice = useCallback((specs: DiceSpec[], title?: string) => handle.current?.promptDice(specs, title) ?? Promise.resolve({}), []);
  const closeRoll = useCallback(() => handle.current?.closeRoll(), []);
  return (<Ctx.Provider value={{ playResolution, promptDice, closeRoll }}>{children}{createPortal(<RollConsole ref={handle} />, document.body)}</Ctx.Provider>);
}
export function useV2Roll(): RollApi { const v = useContext(Ctx); if (!v) throw new Error("useV2Roll outside V2RollProvider"); return v; }
```

- [ ] **Step 4** — append `.v2-roll*` rules to `overlay.css` (dice faces, flip reveal, breakdown equation, manual form) under `.v2-root`. The RollConsole portals to body → wrap its root in `<div className="v2-root">`.
- [ ] **Step 5** — run test → PASS. `npx tsc -p . --noEmit` clean. isolation green.
- [ ] **Step 6** — commit: `git add client/src/v2 && git commit -m "feat(v2): native RollConsole + V2RollContext"`

---

## Self-Review Notes
- Coverage: Drawer + context (T1), RollConsole + context (T2).
- No app wiring in Phase E (deferred to the Phase G switchover). `main.tsx` unchanged.
- Type consistency: `useV2Drawer`, `useV2Roll`, `DrawerConfig`, `DiceSpec`, `RollConsoleHandle`.
