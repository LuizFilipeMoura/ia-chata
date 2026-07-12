# V2 RollConsole Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the V2 dice-resolution console as a "Terminal Sibling" of the Rig Control Terminal — one unified amber frame with real depth, stacked labelled zones, and a flattened single-level breakdown.

**Architecture:** Two coupled files. `overlay.css` gets its console section rewritten (frame depth fix, zone system, flattened breakdown well). `RollConsole.tsx` gets its `render()` reorganised into labelled zones + a bottom action bar for every state. All imperative logic (timers, flicker/settle RAF loop, token flip, reveal timing) is untouched. Everything stays scoped under `.v2-root`.

**Tech Stack:** React (TypeScript, `forwardRef` + `useImperativeHandle`), hand-written CSS on `--v2-*` design tokens. Vite. Vitest (`isolation.test.ts` guards scope leakage).

**Reference spec:** `docs/superpowers/specs/2026-07-11-v2-roll-console-redesign-design.md`

---

## File Structure

- **Modify** `client/src/v2/styles/overlay.css` — replace the console section (current lines ~39–347) and the reduced-motion block (current lines ~435–444). The drawer section (lines 6–37) and everything from the drawer bodies onward (current lines ~349–434: `.v2-dwr-*`, `.v2-field`, `.v2-blast-*`, `.v2-rx-picker`, `.v2-rx-choice`) stay **untouched**.
- **Modify** `client/src/v2/overlays/RollConsole.tsx` — replace only the returned JSX in `render()` (currently lines ~291–435). All hooks, refs, timers, and handler functions above the `return` stay **byte-for-byte identical**.

No new files. No token changes. No changes to the provider/portal wiring.

---

## Task 1: Rewrite the console CSS section

**Files:**
- Modify: `client/src/v2/styles/overlay.css` (replace lines ~39–347)

- [ ] **Step 1: Replace the console block**

In `overlay.css`, find the block that starts with the comment `/* ===== Dice-resolution console — the "roll rig" ===...` (current line ~39) and ends at the `.v2-roll-ok { ... }` rule (current line ~347, just before `/* ===== Drawer bodies ...`). Replace that entire span with:

```css
/* ===== Dice-resolution console — "Terminal Sibling" =========================
   A literal sibling of the Rig Control Terminal (rig-terminal.css): one unified
   amber frame, content split into stacked labelled zones divided by 1px rules,
   and the damage readout flattened to a single sunken strip with an inline
   equation. Depth is a STATIC drop shadow on the console; the breathing amber
   glow lives on a ::after opacity overlay so it never overwrites that shadow
   (the old design animated box-shadow directly, which erased the depth). */
.v2-root.v2-portal-bare { display: contents; }
.v2-roll-scrim {
  z-index: 85;
  padding: 20px 16px; overflow-y: auto;
  opacity: 0; pointer-events: none; transition: opacity .2s ease;
}
.v2-roll-scrim.show { opacity: 1; pointer-events: auto; }
.v2-roll-scrim[hidden] { display: none; }

/* Iron sheet: base .v2-panel surface, re-framed to a single oil-ring outline so
   the whole border matches the glow. Static deep drop + bottom vignette seat it
   on the scrim; sharp corners (v2-panel--sharp). */
.v2-root .v2-roll-console {
  position: relative;
  width: min(480px, 100%);
  border-color: var(--v2-oil-ring);
  box-shadow:
    var(--v2-bevel-top),
    inset 0 -40px 70px rgba(0, 0, 0, .45),
    0 26px 60px rgba(0, 0, 0, .75);
  transform: translateY(12px) scale(.985); opacity: 0;
  transition: transform .28s cubic-bezier(.2, .85, .25, 1), opacity .28s ease;
}
.v2-roll-scrim.show .v2-roll-console { transform: none; opacity: 1; }
/* Breathing amber ring — opacity-animated overlay, so the seating box-shadow
   above is preserved (the whole point of the redesign). */
.v2-root .v2-roll-console::after {
  content: ""; position: absolute; inset: 0; z-index: 2; pointer-events: none;
  box-shadow: inset 0 0 0 1px var(--v2-oil-ring);
  animation: v2-roll-glow 3.2s infinite;
}
@keyframes v2-roll-glow { 0%, 100% { opacity: .45; } 50% { opacity: 1; } }
/* Corner rivets as real spans (frees ::after for the glow overlay). */
.v2-root .v2-roll-rivet {
  position: absolute; top: 9px; width: 9px; height: 9px; z-index: 3;
  border-radius: 50%; pointer-events: none; background: var(--v2-rivet-dot);
}
.v2-root .v2-roll-rivet.l { left: 9px; }
.v2-root .v2-roll-rivet.r { right: 9px; }

/* Header: redline-hatch band, mono order tag + stencilled kind, square close. */
.v2-root .v2-roll-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 20px 14px;
  border-bottom: 1px solid var(--v2-line);
  background: repeating-linear-gradient(-45deg,
    rgba(20, 16, 8, 0) 0 20px, rgba(168, 100, 28, .06) 20px 40px);
}
.v2-root .v2-roll-head-id { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.v2-root .v2-roll-tag { letter-spacing: .3em; color: var(--v2-oil); }
.v2-root .v2-roll-kind {
  font-size: var(--v2-text-lg); letter-spacing: .16em; text-transform: uppercase;
}
.v2-root .v2-roll-close { flex: 0 0 auto; font-size: var(--v2-text-base); line-height: 1; }

/* Stacked labelled zones, split by hairline dividers. */
.v2-root .v2-roll-zone {
  padding: 16px 20px; border-bottom: 1px solid var(--v2-line);
}
.v2-root .v2-roll-zone:last-of-type { border-bottom: 0; }
.v2-root .v2-roll-zone-label {
  font-family: var(--v2-mono); font-size: var(--v2-text-sm);
  letter-spacing: .22em; text-transform: uppercase; color: var(--v2-txt-faint);
  margin-bottom: .8rem;
}

/* Dice: stamped iron tokens. Rolling → dark sunken blank with a flicker numeral;
   settled → milled face, stencilled numeral, tone-keyed glow ring. Behaviour
   unchanged from the previous design. */
.v2-root .v2-roll-dice {
  display: flex; flex-wrap: wrap; justify-content: center; gap: 1.1rem;
  min-height: 4.4rem;
}
.v2-root .v2-die-wrap { display: flex; flex-direction: column; align-items: center; }
.v2-root .v2-die {
  --face: var(--v2-oil);
  width: 3rem; height: 3rem; flex: 0 0 auto;
  display: grid; place-items: center;
  font-family: var(--v2-stencil); font-weight: 700; font-size: var(--v2-text-2xl); line-height: 1;
  color: var(--v2-oil-hi);
  background: linear-gradient(180deg, var(--v2-iron-780), var(--v2-iron-900));
  border: 1px solid var(--v2-well-line);
  box-shadow: inset 0 2px 6px rgba(0, 0, 0, .8), var(--v2-bevel-top);
}
.v2-root .v2-die.d6 { border-radius: 3px; }
.v2-root .v2-die.d12 { border-radius: 50%; }
.v2-root .v2-die.rolling {
  color: var(--v2-txt-faint);
  animation: v2-die-shake .1s steps(2, end) infinite;
}
@keyframes v2-die-shake {
  0% { transform: translate(0, 0) rotate(-5deg); }
  25% { transform: translate(1px, -2px) rotate(4deg); }
  50% { transform: translate(-2px, 1px) rotate(-3deg); }
  75% { transform: translate(2px, 1px) rotate(4deg); }
  100% { transform: translate(0, -1px) rotate(-5deg); }
}
.v2-root .v2-die.settled {
  color: #fff; text-shadow: 0 0 10px color-mix(in srgb, var(--face) 70%, transparent);
  background: linear-gradient(180deg, var(--v2-iron-750), var(--v2-iron-850));
  border-color: var(--face);
  box-shadow:
    0 0 16px 0 color-mix(in srgb, var(--face) 58%, transparent),
    inset 0 1px 0 rgba(255, 255, 255, .08), inset 0 -7px 14px rgba(0, 0, 0, .5);
  animation: v2-die-land .32s cubic-bezier(.2, .85, .25, 1);
}
.v2-root .v2-die.settled[data-tone="crit"] { --face: var(--v2-ember-hi); }
.v2-root .v2-die.settled[data-tone="cool"] { --face: #7fd0c4; }
.v2-root .v2-die.settled[data-tone="ok"] { --face: var(--v2-ok); }
.v2-root .v2-die.settled[data-tone="miss"] {
  --face: var(--v2-txt-faint); color: var(--v2-txt-dim);
  box-shadow: inset 0 2px 6px rgba(0, 0, 0, .8), var(--v2-bevel-top);
}
@keyframes v2-die-land {
  0% { transform: scale(1.28) translateY(-6px); }
  60% { transform: scale(.94); }
  100% { transform: none; }
}
.v2-root .v2-die-verdict {
  display: block; margin-top: .3rem;
  font-weight: 800; letter-spacing: .12em; text-align: center;
  animation: v2-die-land .32s cubic-bezier(.2, .85, .25, 1);
}
.v2-root .v2-die-verdict[data-tone="crit"] {
  color: var(--v2-ember-hi); text-shadow: 0 0 10px rgba(231, 154, 61, .5);
}
.v2-root .v2-die-verdict[data-tone="ok"] { color: var(--v2-ok); }
.v2-root .v2-die-verdict[data-tone="miss"] { color: var(--v2-crit); }
.v2-root .v2-die-label {
  display: block; margin-top: .3rem;
  letter-spacing: .14em; text-align: center;
}
.v2-root .v2-roll-rolling {
  text-align: center; padding: .6rem 0 0;
  letter-spacing: .28em; color: var(--v2-oil);
  animation: v2-lampfast 1s ease-in-out infinite;
}

/* Damage readout — a SINGLE sunken strip holding an INLINE equation. No nested
   panel, no per-term boxes (the old box-in-box). Both the structured breakdown
   (.v2-rx-break) and the fallback summary (.v2-roll-summary) sit in this well. */
.v2-root .v2-roll-strip,
.v2-root .v2-rx-break {
  background: var(--v2-well);
  border: 1px solid var(--v2-well-line); border-top: 1px solid var(--v2-line);
  padding: .8rem .9rem;
  box-shadow: inset 0 2px 6px rgba(0, 0, 0, .6);
}
.v2-root .v2-rx-break-head {
  display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between;
  gap: .3rem .45rem; margin-bottom: .7rem;
  font-family: var(--v2-mono); font-size: var(--v2-text-sm); letter-spacing: .1em; text-transform: uppercase;
}
.v2-root .v2-rx-actor { color: var(--v2-txt-dim); }
.v2-root .v2-rx-weapon { color: var(--v2-oil-hi); font-weight: 700; }
.v2-root .v2-rx-target { color: var(--v2-txt-dim); }

/* Inline equation row — flat flex, terms are inline (no boxes), wraps if needed. */
.v2-root .v2-rx-break-eq {
  display: flex; flex-wrap: wrap; align-items: baseline; gap: .3rem .5rem;
  font-family: var(--v2-mono); font-size: var(--v2-text-base);
}
.v2-root .v2-rx-term-group { display: inline-flex; align-items: baseline; gap: .3rem; }
.v2-root .v2-rx-op { color: var(--v2-txt-faint); font-weight: 700; line-height: 1; }
.v2-root .v2-rx-term { display: inline-flex; align-items: baseline; gap: .25rem; }
.v2-root .v2-rx-term b {
  font-family: var(--v2-stencil); font-size: var(--v2-text-lg); font-weight: 700; line-height: 1;
  color: var(--v2-txt);
}
.v2-root .v2-rx-term em {
  font-family: var(--v2-mono); font-style: normal;
  font-size: var(--v2-text-sm); letter-spacing: .06em; text-transform: uppercase;
  color: var(--v2-txt-faint); white-space: nowrap;
}
.v2-root .v2-rx-term[data-tone="mod"] b { color: var(--v2-oil-hi); text-shadow: 0 0 12px rgba(231, 154, 61, .4); }
.v2-root .v2-rx-term[data-tone="mod"] em { color: var(--v2-oil); }
.v2-root .v2-rx-term[data-tone="die"] b { color: #cdd5e0; }

.v2-root .v2-rx-break-out {
  display: flex; flex-wrap: wrap; align-items: baseline; gap: .5rem .8rem;
  margin-top: .9rem; padding-top: .7rem;
  border-top: 1px dashed rgba(255, 255, 255, .1);
}
.v2-root .v2-rx-total {
  display: inline-flex; align-items: baseline; gap: .25rem;
  font-family: var(--v2-stencil); font-size: var(--v2-text-lg); font-weight: 700; color: var(--v2-txt-dim);
}
.v2-root .v2-rx-total .v2-rx-op { font-size: var(--v2-text-sm); }
.v2-root .v2-rx-tier {
  font-family: var(--v2-mono); font-size: var(--v2-text-sm); font-weight: 700;
  letter-spacing: .16em; text-transform: uppercase;
  padding: .2rem .45rem;
  color: var(--v2-txt-dim); border: 1px solid var(--v2-line); background: rgba(0, 0, 0, .3);
}
.v2-root .v2-rx-tier[data-tier="direct"] { color: #cdd5e0; border-color: var(--v2-rivet); }
.v2-root .v2-rx-tier[data-tier="severe"] {
  color: var(--v2-oil-hi); border-color: var(--v2-oil-deep); background: rgba(231, 154, 61, .12);
}
.v2-root .v2-rx-tier[data-tier="critical"] {
  color: #fff; border-color: var(--v2-ember); background: rgba(229, 83, 58, .22);
  box-shadow: 0 0 12px -1px rgba(229, 83, 58, .6);
}
.v2-root .v2-rx-tier[data-tier="none"] { color: var(--v2-txt-faint); }
.v2-root .v2-rx-sp { display: inline-flex; align-items: baseline; gap: .3rem; margin-left: auto; }
.v2-root .v2-rx-sp b {
  font-family: var(--v2-stencil); font-size: var(--v2-text-3xl); font-weight: 700; line-height: 1;
  color: var(--v2-oil-hi); text-shadow: 0 0 18px rgba(231, 154, 61, .5);
}
.v2-root .v2-rx-sp em {
  font-family: var(--v2-mono); font-style: normal;
  font-size: var(--v2-text-sm); letter-spacing: .1em; text-transform: uppercase; color: var(--v2-txt-dim);
}

/* Fallback summary sentence — plain text inside the same strip. */
.v2-root .v2-roll-summary {
  text-align: center; text-wrap: balance;
  font-family: var(--v2-disp); font-size: var(--v2-text-lg); font-weight: 600; line-height: 1.35;
  color: var(--v2-txt);
}

/* Effects log lines — mono ember lines with a staggered entrance. */
.v2-root .v2-roll-effects { display: flex; flex-direction: column; gap: .45rem; }
.v2-root .v2-roll-effect {
  font-family: var(--v2-mono); font-size: var(--v2-text-sm); letter-spacing: .02em; color: var(--v2-ember-hi);
  padding: .12rem 0 .12rem .55rem;
  border-left: 2px solid var(--v2-ember); text-shadow: 0 0 10px rgba(229, 83, 58, .3);
  opacity: 0; transform: translateY(4px); animation: v2-line-in .3s ease forwards;
}
@keyframes v2-line-in { to { opacity: 1; transform: none; } }

/* ===== Reaction-token flip reveal — a struck coin on an oil hatch back ===== */
.v2-root .v2-rx-reveal {
  display: flex; flex-direction: column; align-items: center; gap: .5rem;
}
.v2-root .v2-rx-token {
  --face: var(--v2-oil);
  position: relative; width: 3.4rem; height: 3.4rem; transform-style: preserve-3d;
}
.v2-root .v2-rx-token.flip { animation: v2-rx-flip .48s cubic-bezier(.2, .85, .25, 1) both; }
.v2-root .v2-rx-token-face {
  position: absolute; inset: 0; display: grid; place-items: center;
  border-radius: 50%; backface-visibility: hidden; font-size: var(--v2-text-2xl);
  border: 1px solid var(--v2-well-line); box-shadow: 0 4px 12px rgba(0, 0, 0, .55);
}
.v2-root .v2-rx-token-back {
  color: #120c04;
  background:
    repeating-linear-gradient(-45deg, rgba(0, 0, 0, .18) 0 4px, transparent 4px 8px),
    linear-gradient(180deg, var(--v2-oil-hi), var(--v2-oil));
  border-color: var(--v2-oil-deep);
}
.v2-root .v2-rx-token-front {
  transform: rotateY(180deg); color: #fff;
  background: linear-gradient(180deg, var(--v2-iron-750), var(--v2-iron-850));
  border-color: var(--face);
  box-shadow:
    0 0 18px 1px color-mix(in srgb, var(--face) 58%, transparent),
    inset 0 1px 0 rgba(255, 255, 255, .08), inset 0 -7px 14px rgba(0, 0, 0, .5);
}
.v2-root .v2-rx-token[data-tone="brace"] { --face: #7fd0c4; }
.v2-root .v2-rx-token[data-tone="evasive"] { --face: var(--v2-oil); }
.v2-root .v2-rx-token[data-tone="return"] { --face: var(--v2-ember-hi); }
@keyframes v2-rx-flip {
  0% { transform: rotateY(0) scale(1.05); }
  60% { transform: rotateY(180deg) scale(.96); }
  100% { transform: rotateY(180deg) scale(1); }
}

/* ===== Manual dice-entry form — sunken iron input wells ===== */
.v2-root .v2-roll-form { display: flex; flex-direction: column; gap: .5rem; }
.v2-root .v2-roll-form-row { display: flex; align-items: center; gap: .5rem; }
.v2-root .v2-roll-form-row label { flex: 1; letter-spacing: .06em; color: var(--v2-txt-dim); }
.v2-root .v2-roll-form-row input {
  width: 4.5rem; padding: .45rem .5rem;
  color: var(--v2-txt); font-family: var(--v2-mono); font-size: var(--v2-text-lg); text-align: center;
}
.v2-root .v2-roll-form-row input:focus {
  outline: none; border-color: var(--v2-oil);
  box-shadow: inset 0 2px 5px rgba(0, 0, 0, .7), 0 0 0 1px var(--v2-oil), 0 0 14px rgba(231, 154, 61, .3);
}

/* Action bar — every state ends with a consistent forged action row. */
.v2-root .v2-roll-action {
  display: flex; gap: .6rem;
  padding: 16px 20px 18px; background: var(--v2-iron-950);
  border-top: 1px solid var(--v2-line);
}
.v2-root .v2-roll-ok,
.v2-root .v2-roll-form-go { flex: 1; padding: .8rem; font-size: var(--v2-text-base); }
.v2-root .v2-roll-ok { opacity: 0; transform: translateY(4px); animation: v2-line-in .3s ease forwards; }
```

- [ ] **Step 2: Update the reduced-motion block**

Find the `@media (prefers-reduced-motion: reduce)` block at the end of the console section (current lines ~435–444) and replace it with:

```css
@media (prefers-reduced-motion: reduce) {
  .v2-root .v2-die.rolling { animation: none; }
  .v2-root .v2-die.settled,
  .v2-root .v2-die-verdict,
  .v2-root .v2-roll-effect,
  .v2-root .v2-roll-console,
  .v2-root .v2-roll-ok { animation: none; opacity: 1; transform: none; }
  .v2-root .v2-rx-token.flip { animation: none; transform: rotateY(180deg); }
}
```

- [ ] **Step 3: Sanity-check the CSS compiles**

Run: `cd client && npx tsc --noEmit -p tsconfig.json`
Expected: PASS (CSS isn't type-checked, but this confirms nothing else broke). Do not commit yet — the TSX in Task 2 references the new classes; commit both together at the end of Task 2.

---

## Task 2: Rework the RollConsole render into zones

**Files:**
- Modify: `client/src/v2/overlays/RollConsole.tsx` (replace the JSX returned by `render()`, current lines ~291–435)

- [ ] **Step 1: Replace the return block**

Everything above `const rolling = ...` (the hooks, refs, timer helpers, `playResolution`, `promptDice`, `onFormGo`, effects, `useImperativeHandle`) stays **identical**. Replace from `const rolling =` through the end of the returned JSX with:

```tsx
  const rolling = dice.length > 0 && dice.some((d) => !d.settled);
  const showAction = (!formHidden && formSpecs.length > 0) || !okHidden;

  return (
    <div className="v2-root v2-portal-bare">
      <div
        className={"v2-roll-scrim v2-scrim v2-scrim--oil" + (visible ? " show" : "")}
        hidden={hidden}
        onClick={(e) => {
          if (e.target === e.currentTarget) closeRoll();
        }}
      >
        <div
          className="v2-roll-console v2-panel v2-panel--sharp"
          role="dialog"
          aria-modal="true"
          aria-label="Dice resolution"
        >
          <span className="v2-roll-rivet l" aria-hidden="true" />
          <span className="v2-roll-rivet r" aria-hidden="true" />
          <div className="v2-roll-head">
            <div className="v2-roll-head-id">
              <span className="v2-roll-tag v2-eyebrow" aria-hidden="true">▚ dice cast</span>
              <span className="v2-roll-kind v2-title">{kind}</span>
            </div>
            <button
              className="v2-roll-close v2-close"
              type="button"
              aria-label="Dismiss"
              onClick={closeRoll}
            >
              ✕
            </button>
          </div>

          {reveal ? (
            <div className="v2-roll-zone">
              <div className="v2-roll-zone-label">Reaction</div>
              <div className="v2-rx-reveal">
                <div className="v2-rx-token flip" data-tone={reveal.prep} aria-label={reveal.label}>
                  <span className="v2-rx-token-face v2-rx-token-back" aria-hidden="true">⟡</span>
                  <span className="v2-rx-token-face v2-rx-token-front" aria-hidden="true">{reveal.icon}</span>
                </div>
                <span className="v2-die-label v2-eyebrow">{reveal.label}</span>
              </div>
            </div>
          ) : null}

          {dice.length > 0 ? (
            <div className="v2-roll-zone">
              <div className="v2-roll-zone-label">Dice</div>
              <div className="v2-roll-dice">
                {dice.map((d, i) => (
                  <div className="v2-die-wrap" key={i}>
                    <div
                      className={
                        "v2-die " +
                        (d.sides === 12 ? "d12" : "d6") +
                        (d.settled ? " settled" : " rolling")
                      }
                      data-tone={d.settled ? d.tone : undefined}
                      ref={(el) => {
                        dieEls.current[i] = el;
                      }}
                    >
                      {d.settled ? String(d.value) : String(1 + Math.floor(Math.random() * d.sides))}
                    </div>
                    {d.settled && verdictLabel(d.tone) ? (
                      <span className="v2-die-verdict v2-eyebrow" data-tone={d.tone}>
                        {verdictLabel(d.tone)}
                      </span>
                    ) : null}
                    <span className="v2-die-label v2-eyebrow">{d.label}</span>
                  </div>
                ))}
              </div>
              {rolling && <div className="v2-roll-rolling v2-eyebrow">Rolling…</div>}
            </div>
          ) : null}

          {breakdown ? (
            <div className="v2-roll-zone">
              <div className="v2-roll-zone-label">Damage</div>
              <div className="v2-rx-break" aria-label={summary}>
                {(breakdown.actor || breakdown.weapon || breakdown.target) && (
                  <div className="v2-rx-break-head">
                    {breakdown.actor && <span className="v2-rx-actor">{breakdown.actor}</span>}
                    {breakdown.weapon && <span className="v2-rx-weapon">{breakdown.weapon}</span>}
                    {breakdown.target && <span className="v2-rx-target">→ {breakdown.target}</span>}
                  </div>
                )}
                <div className="v2-rx-break-eq">
                  {(breakdown.terms || []).map((t, i) => (
                    <span className="v2-rx-term-group" key={i}>
                      {t.op ? <span className="v2-rx-op">{t.op}</span> : null}
                      <span className="v2-rx-term" data-tone={t.tone}>
                        <b>{t.value}</b>
                        <em>{t.label}</em>
                      </span>
                    </span>
                  ))}
                </div>
                <div className="v2-rx-break-out">
                  {breakdown.total != null && (
                    <span className="v2-rx-total">
                      <span className="v2-rx-op">=</span>
                      {breakdown.total}
                    </span>
                  )}
                  {breakdown.tier && (
                    <span className="v2-rx-tier" data-tier={breakdown.tier}>
                      {breakdown.tier}
                    </span>
                  )}
                  <span className="v2-rx-sp">
                    <b>{breakdown.sp}</b>
                    <em>{breakdown.location ? `SP → ${breakdown.location}` : "SP"}</em>
                  </span>
                </div>
              </div>
            </div>
          ) : summary ? (
            <div className="v2-roll-zone">
              <div className="v2-roll-zone-label">Result</div>
              <div className="v2-roll-strip">
                <div className="v2-roll-summary">{summary}</div>
              </div>
            </div>
          ) : null}

          {effects.length > 0 ? (
            <div className="v2-roll-zone">
              <div className="v2-roll-zone-label">Effects</div>
              <div className="v2-roll-effects">
                {effects.map((e, i) => (
                  <div
                    className="v2-roll-effect"
                    key={i}
                    style={{ animationDelay: `${e.delay}s` }}
                  >
                    {e.text}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {!formHidden ? (
            <div className="v2-roll-zone">
              <div className="v2-roll-zone-label">Enter dice</div>
              <div className="v2-roll-form">
                {formSpecs.map((spec, i) => (
                  <div className="v2-roll-form-row" key={i}>
                    <label className="v2-eyebrow" htmlFor={`${formId}-${i}`}>{`${spec.label} (D${spec.sides})`}</label>
                    <input
                      className="v2-well"
                      id={`${formId}-${i}`}
                      type="number"
                      min="1"
                      max={String(spec.sides)}
                      inputMode="numeric"
                      ref={(el) => {
                        inputEls.current[i] = el;
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {showAction ? (
            <div className="v2-roll-action">
              {!formHidden && formSpecs.length ? (
                <button className="v2-roll-form-go v2-cta" type="button" onClick={onFormGo}>
                  Confirm roll
                </button>
              ) : null}
              {!okHidden ? (
                <button className="v2-roll-ok v2-cta" type="button" onClick={closeRoll}>
                  OK
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
});

export default RollConsole;
```

Note: the old `OK`/`Confirm` buttons used the `hidden` attribute; they are now conditionally mounted inside `.v2-roll-action` instead. The `okHidden` / `formHidden` state still drives visibility exactly as before — only the mounting mechanism changed. Nothing else in the file changes.

- [ ] **Step 2: Type-check**

Run: `cd client && npx tsc --noEmit -p tsconfig.json`
Expected: PASS, no errors.

- [ ] **Step 3: Run the isolation + unit tests**

Run: `cd client && npx vitest run` (or the repo's configured test command, e.g. `npm test` from `client/`).
Expected: PASS, including `isolation.test.ts` (no `.v2-*` rules leak outside `.v2-root`).

- [ ] **Step 4: Commit both files**

```bash
git add client/src/v2/styles/overlay.css client/src/v2/overlays/RollConsole.tsx
git commit -m "redesign(v2): RollConsole as Terminal Sibling — zones, unified frame, flat breakdown"
```

---

## Task 3: Visual verification of every state

**Files:** none (verification only)

- [ ] **Step 1: Launch the app preview**

Start the dev server (via the preview tooling / `.claude/launch.json`, not a raw shell server). Open the battle view.

- [ ] **Step 2: Trigger and eyeball each console state**

Confirm each of these renders correctly:
- **Resolution + breakdown** — Dice / Damage / Effects zones + OK. Breakdown is a single sunken strip with an inline equation (no per-term boxes, no panel-in-panel).
- **Resolution, no breakdown** — Dice / Result (summary sentence) / Effects zones + OK.
- **Reaction** — Reaction zone (flip token) / Effects + OK. No dice, no damage.
- **Manual dice entry** — Enter dice zone with number inputs + a Confirm button in the action bar.
- **Rolling** — dice flicker under the Dice label with "Rolling…"; later zones appear as data settles.

For each, verify: the console **seats with a visible drop shadow** (not floating flat); the **frame is one continuous amber outline** (no gray side borders); zone rhythm is even; the **hatch header stripe** is intact.

- [ ] **Step 3: Reduced-motion pass**

In the browser devtools, emulate `prefers-reduced-motion: reduce` and re-open a resolution. Confirm the console, dice, effects, and OK button all show their static end-states (visible, no animation) and the token reveal shows its flipped face.

- [ ] **Step 4: Capture proof**

Take a screenshot of the resolution-with-breakdown state and share it. No commit needed unless a fix was required.

---

## Self-Review (completed by plan author)

- **Spec coverage:** Frame depth fix (Task 1 §console + ::after glow) ✓; unified oil-ring border ✓; corner rivets as spans ✓; hatch header kept ✓; 480px width ✓; labelled zones + dividers + action bar ✓; all 5 states mapped (Task 2 conditionals) ✓; flattened inline breakdown strip ✓; Result/summary reuse of strip ✓; dice unchanged ✓; type/spacing scale ✓; reduced-motion preserved ✓; `.v2-root` scoping + isolation test ✓ (Task 2 §3); two-files-only + logic untouched ✓.
- **Placeholder scan:** none — every step carries the full literal code or an exact command.
- **Type/name consistency:** class names used in the TSX (`v2-roll-rivet`, `v2-roll-zone`, `v2-roll-zone-label`, `v2-roll-strip`, `v2-roll-summary`, `v2-roll-action`, `v2-roll-form-go`, `v2-roll-ok`, and all reused `v2-rx-*`/`v2-die*`) all have matching rules in the CSS. `showAction` guard matches the two button conditions. Reused data props (`breakdown.terms[].op/value/label/tone`, `breakdown.tier/total/sp/location`) are unchanged from the original render.
```
