# V2 Status Strip — Minimal Utility Line — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce the V2 top status strip to a thin utility line — badge + room code + glossary only, dropping the wordmark, MK·IV plate, and LINK/LOCAL telemetry.

**Architecture:** Pure presentation change in the `Shell` component and its stylesheet. Remove chrome elements from the strip markup, scale the badge down, trim the now-dead CSS selectors, and add one small room-code style. Shared primitives (`.v2-lamp--ok`, `.v2-badge`) stay untouched.

**Tech Stack:** React + TypeScript, Vitest + Testing Library, plain scoped CSS (`.v2-root` prefix).

---

## File Structure

- `client/src/v2/components/Shell.tsx` — strip markup (`<header className="v2-strip">`) and the `react` import line.
- `client/src/v2/styles/shell.css` — `.v2-strip` block rules (~lines 13–32).
- `client/src/v2/components/Shell.test.tsx` — regression guards for the two survivors + new negative assertions.

Reference: spec at `docs/superpowers/specs/2026-07-11-v2-strip-minimal-design.md`.

---

### Task 1: Lock the strip contract in tests

**Files:**
- Test: `client/src/v2/components/Shell.test.tsx` (modify the existing `"shows the room code and only the Yard channel active"` test, ~lines 26–34)

- [ ] **Step 1: Add negative assertions to the existing test**

In `Shell.test.tsx`, extend the first test so it guards both survivors AND the removed chrome. Replace the body of `test("shows the room code and only the Yard channel active", ...)` with:

```tsx
test("shows the room code and only the Yard channel active", async () => {
  render(<AppProviders><Seed state={baseState} /><Shell channel="yard"><div /></Shell></AppProviders>);
  // survivors
  expect(await screen.findByText(/IRON-42/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Glossary/i })).toBeInTheDocument();
  // removed chrome — strip is now a minimal utility line
  expect(screen.queryByText(/OIL & IRON/i)).not.toBeInTheDocument();
  expect(screen.queryByText(/MK·IV/)).not.toBeInTheDocument();
  expect(screen.queryByText(/^LINK$/)).not.toBeInTheDocument();
  expect(screen.queryByText(/^LOCAL$/)).not.toBeInTheDocument();
  // channels unchanged
  expect(screen.getByRole("button", { name: /Yard/i })).toBeEnabled();
  expect(screen.getByRole("button", { name: /Yard/i })).toHaveAttribute("aria-current", "page");
  expect(screen.getByRole("button", { name: /Forge/i })).toBeEnabled();
  expect(screen.getByRole("button", { name: /Rules/i })).toBeEnabled();
  expect(screen.getByRole("button", { name: /Verdict/i })).toBeDisabled();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd client && npx vitest run src/v2/components/Shell.test.tsx -t "shows the room code"`
Expected: FAIL — the `queryByText(/OIL & IRON/i)` (and MK·IV / LINK / LOCAL) assertions fail because the current strip still renders that chrome.

---

### Task 2: Strip the markup in `Shell.tsx`

**Files:**
- Modify: `client/src/v2/components/Shell.tsx` (import line 1; strip markup ~lines 49–69)

- [ ] **Step 1: Drop the now-unused `CSSProperties` import**

The only use of `CSSProperties` is the lamp's inline style, which is being removed. Change line 1 from:

```tsx
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
```

to:

```tsx
import { useEffect, useState, type ReactNode } from "react";
```

- [ ] **Step 2: Replace the strip markup**

Replace the entire `<header className="v2-strip"> … </header>` block (currently ~lines 49–69) with:

```tsx
      <header className="v2-strip">
        <div className="v2-brand">
          <div className="v2-brand-badge v2-badge"><div className="v2-brand-core" /></div>
        </div>
        <div className="v2-strip-spacer" />
        <div className="v2-strip-rm">RM <span>{session?.room}</span></div>
        <button type="button" className="v2-gloss-btn" aria-label="Glossary" onClick={() => onGlossary?.()}>ⓘ</button>
      </header>
```

This removes `.v2-brand-name` (wordmark), `.v2-brand-mk` (plate), and the whole `.v2-telemetry` block (lamp + LINK + LOCAL + separator), while keeping the badge, spacer, room code, and glossary button.

- [ ] **Step 3: Run the test to verify it passes**

Run: `cd client && npx vitest run src/v2/components/Shell.test.tsx -t "shows the room code"`
Expected: PASS — chrome gone, room code + glossary still present.

- [ ] **Step 4: Run the full Shell test file**

Run: `cd client && npx vitest run src/v2/components/Shell.test.tsx`
Expected: PASS — all tests (glossary handler, leave dialog, revert) still green.

---

### Task 3: Restyle the strip in `shell.css`

**Files:**
- Modify: `client/src/v2/styles/shell.css` (`.v2-strip` block, ~lines 13–32)

- [ ] **Step 1: Replace the strip CSS block**

Replace the current block (from `.v2-root .v2-strip{` through `.v2-root .v2-gloss-btn:hover{...}`, ~lines 14–32) with the following. Note: `.v2-brand-name`, `.v2-brand-mk`, `.v2-telemetry`, `.v2-tele`, `.v2-tele-key`, `.v2-tele-val`, `.v2-tele-sep` are deleted; `.v2-lamp--ok` is KEPT (used by `chat/ChatPanel.tsx`); the badge is scaled down; `.v2-strip-rm` is added.

```css
/* ---- Status strip (mockup 55-71) — minimal utility line ---- */
.v2-root .v2-strip{flex:0 0 auto;display:flex;align-items:center;gap:14px;padding:6px 14px;background:linear-gradient(180deg,var(--v2-iron-850),#0b0e13);border-bottom:2px solid #000;box-shadow:inset 0 -1px 0 rgba(231,154,61,.14),0 3px 10px rgba(0,0,0,.6);}
.v2-root .v2-strip-spacer{flex:1;}

.v2-root .v2-brand{display:flex;align-items:center;gap:11px;}
.v2-root .v2-brand-badge{width:20px;height:20px;border:2px solid var(--v2-oil-deep);box-shadow:inset 0 0 8px rgba(0,0,0,.7);position:relative;}
.v2-root .v2-brand-core{width:8px;height:8px;border-radius:50%;background:radial-gradient(circle at 40% 35%,#ffbf6a,#a8641c 60%,#3a220a);box-shadow:0 0 8px rgba(231,154,61,.6);}

/* room code readout — mono key + oil-hi value */
.v2-root .v2-strip-rm{font-family:var(--v2-mono);font-size:var(--v2-text-sm);letter-spacing:.14em;color:var(--v2-txt-faint);}
.v2-root .v2-strip-rm span{color:var(--v2-oil-hi);}

.v2-root .v2-lamp--ok{color:var(--v2-ok);}
.v2-root .v2-gloss-btn{flex:0 0 auto;display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:50%;border:1px solid var(--v2-line);background:var(--v2-well);color:var(--v2-oil-hi);font-size:var(--v2-text-sm);line-height:1;cursor:pointer;}
.v2-root .v2-gloss-btn:hover{border-color:var(--v2-oil-deep);color:var(--v2-oil);}
```

- [ ] **Step 2: Confirm no other file references the removed selectors**

Run: `cd client && grep -rn "v2-brand-name\|v2-brand-mk\|v2-telemetry\|v2-tele\b\|v2-tele-key\|v2-tele-val\|v2-tele-sep" src/v2 --include=*.tsx --include=*.ts --include=*.css`
Expected: NO matches (all references were inside the old strip markup + CSS, now both removed).

- [ ] **Step 3: Re-run the Shell tests**

Run: `cd client && npx vitest run src/v2/components/Shell.test.tsx`
Expected: PASS (CSS changes don't affect assertions; this confirms nothing regressed).

---

### Task 4: Visual verification + commit

**Files:** none (verify + commit)

- [ ] **Step 1: Visual check in the dev server**

Start the dev server and open the in-room view. Confirm:
- Strip is a single thin line (~30px), noticeably shorter than before.
- Left: small iron badge only — no "OIL & IRON" wordmark, no "MK·IV" plate.
- Right: `RM <room>` in mono + the `ⓘ` glossary button. No green lamp, no "LINK LOCAL".
- The screen/content area below gained vertical space.

- [ ] **Step 2: Run the v2 test suite to be safe**

Run: `cd client && npx vitest run src/v2`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add client/src/v2/components/Shell.tsx client/src/v2/components/Shell.test.tsx client/src/v2/styles/shell.css
git commit -m "refactor(v2): minimal status strip — badge + room code only

Drop wordmark, MK·IV plate, and LINK/LOCAL telemetry from the top strip;
scale the badge down and thin the bar. Room code + glossary kept."
```
