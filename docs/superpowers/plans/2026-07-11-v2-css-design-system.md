# V2 CSS Design System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate all duplicated v2 CSS into a layered design system (expanded tokens → shared primitives → lean component files), applied in TSX, cutting ~30–35% of v2 CSS with one source of truth per pattern.

**Architecture:** Three CSS layers imported in order — `tokens.css` (design tokens), `primitives.css` (shared classes built on tokens), and per-component files holding only unique structure. Primitive classes are applied directly in v2 `.tsx` files, replacing per-component duplicate rules. Inconsistencies collapse to one canonical value each (consistency prioritized over preserving current pixels).

**Tech Stack:** Vite + React (CSS imported via ES `import` per component). No CSS preprocessor — plain CSS custom properties. Verification is browser preview (Browser pane tools) + `grep`, not unit tests.

**Reference:** Spec at `docs/superpowers/specs/2026-07-11-v2-css-design-system-design.md`. Duplication pattern letters (A–P) referenced below map to that analysis.

---

## Verification model (read first)

CSS has no unit tests here. Each task's "test" is a falsifiable check:
- **Preview check:** start the dev server, open the affected v2 screen, confirm it renders and matches intent (screenshot or `read_page`). Never claim done without observing it.
- **Grep check:** after migrating a file, the raw literals it used must be gone.

Start the dev server once via the Browser pane (`preview_start`). If `.claude/launch.json` has no dev entry, create one for the client dev server (`npm run dev` in `client/`, its Vite port) before Task 1. Reuse the running server across tasks; reload after each CSS change (HMR usually handles it).

Commit after every task.

---

## File Structure

**Created:**
- `client/src/v2/styles/primitives.css` — all shared classes.

**Modified:**
- `client/src/v2/styles/tokens.css` — expanded token set.
- `client/src/v2/V2App.tsx` — import `primitives.css` after `tokens.css`.
- All 11 v2 component CSS files — duplicated rules deleted.
- Their matching v2 `.tsx` files — primitive classes applied.

---

## Task 1: Expand tokens.css

**Files:**
- Modify: `client/src/v2/styles/tokens.css`

- [ ] **Step 1: Add new tokens to the `.v2-root` block**

Insert these after the existing custom-property lines (before the `position:fixed` layout block), inside `.v2-root`:

```css
  /* surfaces / lines / edges */
  --v2-well:#0a0d11; --v2-well-deep:#07090c; --v2-well-line:#000; --v2-edge-dark:#05070a;
  /* canonical gradients */
  --v2-surface:linear-gradient(180deg,var(--v2-iron-850),var(--v2-iron-900));
  --v2-grad-oil-cta:linear-gradient(180deg,#f0a94a,#c47a26);
  --v2-grad-ember-cta:linear-gradient(180deg,#f0663f,#b8351f);
  --v2-grad-ember-well:linear-gradient(180deg,#26170f,#160c07);
  --v2-grad-green-well:linear-gradient(180deg,#1c2a1c,#0d160d);
  --v2-grad-oil-sel:linear-gradient(180deg,#241a0d,#1a1207);
  --v2-grad-badge:conic-gradient(from 20deg,#2a1c0c,#5a3c14,#2a1c0c);
  --v2-rivet-dot:radial-gradient(circle at 40% 35%,#69727f,#20252e 60%,rgba(0,0,0,.7));
  /* accents */
  --v2-oil-lite:#ffcf82; --v2-oil-edge:#7c4d14; --v2-ember-lite:#ff8a6a;
  --v2-on-oil:#1a1206; --v2-verdigris:#2f5c33;
  /* canonical alphas */
  --v2-oil-wash:rgba(231,154,61,.1); --v2-oil-ring:rgba(231,154,61,.4); --v2-oil-glow:rgba(231,154,61,.3);
  --v2-ember-wash:rgba(229,83,58,.12); --v2-ember-glow:rgba(229,83,58,.3);
  --v2-ok-wash:rgba(108,196,127,.12); --v2-ok-glow:rgba(108,196,127,.3);
  --v2-bevel-top:inset 0 1px 0 rgba(255,255,255,.05);
  /* scrim */
  --v2-scrim:rgba(5,7,10,.72);
  --v2-scrim-oil:radial-gradient(80% 60% at 50% 18%,var(--v2-oil-wash),transparent 70%),var(--v2-scrim);
  --v2-scrim-ember:radial-gradient(80% 60% at 50% 18%,var(--v2-ember-wash),transparent 70%),var(--v2-scrim);
  /* motion / shape */
  --v2-dur-fast:.14s; --v2-dur-slow:.25s;
  --v2-r-sm:8px; --v2-r-card:14px; --v2-r-pill:999px; --v2-r-round:50%;
  --v2-ls-eyebrow:.2em; --v2-ls-title:.1em;
```

- [ ] **Step 2: Verify build + no visual regression**

Reload the dev server, open a v2 screen. Expected: renders identically (tokens are additive, nothing references them yet). Take a screenshot to confirm no breakage.

- [ ] **Step 3: Verify tokens present**

Run: `grep -c -- "--v2-surface\|--v2-well\|--v2-scrim\|--v2-dur-fast\|--v2-r-card" client/src/v2/styles/tokens.css`
Expected: count ≥ 5.

- [ ] **Step 4: Commit**

```bash
git add client/src/v2/styles/tokens.css
git commit -m "feat(v2): expand design tokens (surfaces, gradients, alphas, scrim, motion, shape)"
```

---

## Task 2: Create primitives.css

**Files:**
- Create: `client/src/v2/styles/primitives.css`
- Modify: `client/src/v2/V2App.tsx:2` (add import after tokens)

- [ ] **Step 1: Write primitives.css**

```css
/* V2 primitives — shared classes built on tokens.css.
   Imported once after tokens.css. Component files MUST NOT redefine these. */

/* layout utils */
.v2-stack{display:flex;flex-direction:column;gap:var(--v2-gap,.5rem);}
.v2-row{display:flex;align-items:center;gap:var(--v2-gap,.5rem);}
.v2-center{display:grid;place-items:center;}
.v2-grid-2{display:grid;grid-template-columns:repeat(2,1fr);gap:var(--v2-gap,.5rem);}
.v2-grid-3{display:grid;grid-template-columns:repeat(3,1fr);gap:var(--v2-gap,.5rem);}

/* panel surface (A) */
.v2-panel{
  background:var(--v2-surface);
  border:1px solid var(--v2-rivet);
  border-radius:var(--v2-r-card);
  box-shadow:var(--v2-bevel-top),0 18px 50px rgba(0,0,0,.6);
}
.v2-panel--sharp{border-radius:0;}

/* scrim (C/D) */
.v2-scrim{
  position:fixed;inset:0;display:grid;place-items:center;
  padding:1rem;background:var(--v2-scrim);
  backdrop-filter:blur(2px);z-index:40;
}
.v2-scrim--oil{background:var(--v2-scrim-oil);}
.v2-scrim--ember{background:var(--v2-scrim-ember);}

/* eyebrow micro-label (F) */
.v2-eyebrow{
  font-family:var(--v2-mono);font-size:9px;
  letter-spacing:var(--v2-ls-eyebrow);text-transform:uppercase;
  color:var(--v2-txt-faint);
}

/* stencil title (G) */
.v2-title{
  font-family:var(--v2-stencil);font-weight:700;
  letter-spacing:var(--v2-ls-title);color:var(--v2-txt);
  text-shadow:0 2px 0 rgba(0,0,0,.6);
}

/* CTA button (I/J) */
.v2-cta{
  font-family:var(--v2-disp);font-weight:600;text-transform:uppercase;
  letter-spacing:.08em;color:var(--v2-on-oil);cursor:pointer;
  background:var(--v2-grad-oil-cta);
  border:1px solid var(--v2-oil-lite);
  border-bottom:3px solid var(--v2-oil-edge);
  border-radius:var(--v2-r-sm);
  box-shadow:0 0 12px var(--v2-oil-glow);
  transition:filter var(--v2-dur-fast);
}
.v2-cta:hover{filter:brightness(1.08);}
.v2-cta:disabled{opacity:.5;cursor:not-allowed;filter:none;}
.v2-cta--ember{
  background:var(--v2-grad-ember-cta);
  border-color:var(--v2-ember-lite);
  border-bottom-color:var(--v2-ember-deep);
  box-shadow:0 0 12px var(--v2-ember-glow);
}

/* sunken well (E) */
.v2-well{
  background:var(--v2-well-deep);
  border:1px solid var(--v2-well-line);
  box-shadow:inset 0 2px 6px rgba(0,0,0,.75);
}

/* canonical selected oil state (H) */
.is-sel{
  border-color:var(--v2-oil);
  background:linear-gradient(180deg,var(--v2-oil-wash),var(--v2-iron-850));
  box-shadow:inset 0 0 0 1px var(--v2-oil-ring),0 0 16px var(--v2-oil-wash);
}

/* segmented option field (P) */
.v2-field{display:flex;flex-direction:column;gap:.35rem;}
.v2-field-seg{display:flex;flex-wrap:wrap;gap:.4rem;}
.v2-opt{
  flex:1 1 0;padding:.5rem .6rem;text-align:center;cursor:pointer;
  background:var(--v2-iron-800);border:1px solid var(--v2-line);
  color:var(--v2-txt-dim);border-radius:var(--v2-r-sm);
  transition:border-color var(--v2-dur-fast),color var(--v2-dur-fast);
}
.v2-opt:hover{color:var(--v2-txt);}

/* lamp dot (N) */
.v2-lamp{
  width:8px;height:8px;border-radius:var(--v2-r-round);
  background:var(--v2-ok);box-shadow:0 0 8px currentColor;
  animation:v2-lampfast var(--v2-lamp-speed,2s) infinite;
}

/* corner rivet (B) */
.v2-rivet{
  position:absolute;width:8px;height:8px;border-radius:var(--v2-r-round);
  background:var(--v2-rivet-dot);
}

/* badge medallion (M) */
.v2-badge{
  display:grid;place-items:center;border-radius:var(--v2-r-round);
  background:var(--v2-grad-badge);
}

/* hazard stripe (L) */
.v2-hazard{
  background:repeating-linear-gradient(-45deg,
    var(--v2-hazard-dark,#0c0709) 0 var(--v2-hazard-w,9px),
    var(--v2-hazard-accent,#7c2331) var(--v2-hazard-w,9px) calc(var(--v2-hazard-w,9px)*2));
}

/* dialog close button */
.v2-close{
  display:grid;place-items:center;width:30px;height:30px;
  background:var(--v2-iron-800);border:1px solid var(--v2-line);
  color:var(--v2-txt-dim);cursor:pointer;
  transition:color var(--v2-dur-fast),border-color var(--v2-dur-fast);
}
.v2-close:hover{color:var(--v2-ember-hi);border-color:var(--v2-ember-deep);}
```

- [ ] **Step 2: Import it in V2App.tsx**

At `client/src/v2/V2App.tsx`, add immediately after line 2 (`import "./styles/tokens.css";`):

```tsx
import "./styles/primitives.css";
```

- [ ] **Step 3: Verify build + no visual change**

Reload the dev server, open a v2 screen. Expected: unchanged (no component uses primitives yet). Screenshot to confirm.

- [ ] **Step 4: Commit**

```bash
git add client/src/v2/styles/primitives.css client/src/v2/V2App.tsx
git commit -m "feat(v2): add primitives.css shared-class layer"
```

---

## Migration tasks (3–13): per-file procedure

Every migration task follows the SAME five steps. Only the target file and its specific replacements differ. The procedure:

1. **Open the component's screen in preview** and screenshot it (the "before" reference).
2. **Edit the CSS file:** for each duplicated rule listed in the task, delete the duplicated declarations and either (a) replace them with a token reference, or (b) remove the rule entirely because a primitive now covers it.
3. **Edit the matching `.tsx`:** add the primitive class(es) to the JSX elements that previously carried the deleted rules. Keep component-unique structural classes.
4. **Verify preview:** reload, re-open the screen, screenshot. Compare to the before reference — must match intent (unified values may shift slightly; layout/legibility must not regress). Check `read_console_messages` for errors.
5. **Grep + commit** (commands per task).

For any leftover component-specific color/shadow/duration literal, replace with the nearest token from Task 1. If no token fits and the value is truly one-off (used once), it may stay — note it. The bar: no literal that already has a token, and no re-implementation of an A–P pattern.

---

## Task 3: Migrate shell.css

**Files:**
- Modify: `client/src/v2/styles/shell.css`, `client/src/v2/components/Shell.tsx`

- [ ] **Step 1: Screenshot the shell (top strip, brand, dock) as before-reference.**

- [ ] **Step 2: Replace in shell.css**
  - `.v2-leave-scrim` → delete scrim declarations; apply `.v2-scrim` in TSX.
  - `.v2-leave` card gradient/border/shadow → delete; apply `.v2-panel` in TSX (keep unique padding/size).
  - `.v2-brand-badge` conic gradient → delete; apply `.v2-badge` in TSX.
  - `.v2-dock-label`, `.v2-brand-sub` mono-uppercase-faint → delete those props; apply `.v2-eyebrow`.
  - `.v2-brand-name` stencil → apply `.v2-title`; keep unique size.
  - lamp dots → apply `.v2-lamp` with `style={{ ["--v2-lamp-speed"]: "2.4s" }}` (or set `--v2-lamp-speed:2.4s` on the class in shell.css only if repeated).
  - literal `#12161d` → `var(--v2-iron-850)`; `#0a0d11` → `var(--v2-well)`; `#05070a` → `var(--v2-edge-dark)`.
  - transitions `.14s`/`.12s` → `var(--v2-dur-fast)`.

- [ ] **Step 3: Apply the classes in Shell.tsx** (`.v2-scrim`, `.v2-panel`, `.v2-badge`, `.v2-eyebrow`, `.v2-title`, `.v2-lamp`) on the corresponding elements.

- [ ] **Step 4: Verify preview** — reload, screenshot, compare, check console clean.

- [ ] **Step 5: Grep + commit**

Run: `grep -nE "#0a0d11|#12161d|#05070a|linear-gradient\(180deg,var\(--v2-iron-8" client/src/v2/styles/shell.css`
Expected: no matches (or only justified one-offs).

```bash
git add client/src/v2/styles/shell.css client/src/v2/components/Shell.tsx
git commit -m "refactor(v2): migrate shell to primitives + tokens"
```

---

## Task 4: Migrate glossary.css

**Files:**
- Modify: `client/src/v2/styles/glossary.css`, and the glossary component(s) (`grep -rl "v2-gloss" client/src/v2 --include=*.tsx`).

- [ ] **Step 1: Screenshot glossary dialog + tip.**

- [ ] **Step 2: Replace in glossary.css**
  - `.v2-gloss-dialog-scrim` → `.v2-scrim` in TSX.
  - `.v2-gloss-dialog` surface → `.v2-panel` (keep tip-arrow logic, term-highlight — unique).
  - `.v2-gloss-tip` surface → `.v2-panel--sharp` or `.v2-panel` (keep arrow); unify its `iron-800/900` to `var(--v2-surface)`.
  - close buttons `.v2-gloss-*-close` → `.v2-close` in TSX.
  - eyebrow-style labels → `.v2-eyebrow`.
  - transitions → `var(--v2-dur-fast)`; radii → `var(--v2-r-card)`/`--v2-r-sm`.

- [ ] **Step 3: Apply classes in the glossary TSX.**

- [ ] **Step 4: Verify preview** (open a glossary term + tip).

- [ ] **Step 5: Grep + commit**

Run: `grep -nE "rgba\(5,7,10|rgba\(4,5,7|conic-gradient|#f0a94a" client/src/v2/styles/glossary.css`
Expected: no matches.

```bash
git add client/src/v2/styles/glossary.css client/src/v2/**/*.tsx
git commit -m "refactor(v2): migrate glossary to primitives + tokens"
```

---

## Task 5: Migrate field.css

**Files:**
- Modify: `client/src/v2/styles/field.css` + field component(s) (`grep -rl "v2-fs\|v2-fm\|v2-fc" client/src/v2 --include=*.tsx`).

- [ ] **Step 1: Screenshot the field map screen.**

- [ ] **Step 2: Replace in field.css**
  - Keep the blueprint SVG (`.v2-fm*`) and legend — unique.
  - `.v2-fs-cap`, `.v2-fs-label`, `.v2-fs-leg` mono-uppercase → `.v2-eyebrow`.
  - inputs/hero-button overlapping forge/overlay → apply `.v2-cta`/`.v2-well` where they match; keep unique sizing.
  - transitions already use `var(--v2-dur-fast,.14s)` — change to bare `var(--v2-dur-fast)`.
  - stray hex → tokens.

- [ ] **Step 3: Apply classes in field TSX.**

- [ ] **Step 4: Verify preview.**

- [ ] **Step 5: Grep + commit**

Run: `grep -nE "#07090c|\.14s|text-transform:uppercase" client/src/v2/styles/field.css`
Expected: no raw `#07090c`, no bare `.14s`; remaining uppercase only on non-eyebrow uniques.

```bash
git add client/src/v2/styles/field.css client/src/v2/**/*.tsx
git commit -m "refactor(v2): migrate field to primitives + tokens"
```

---

## Task 6: Migrate wizards.css

**Files:**
- Modify: `client/src/v2/styles/wizards.css` + wizard component(s) (`grep -rl "v2-aw\|v2-vpw" client/src/v2 --include=*.tsx`).

- [ ] **Step 1: Screenshot a wizard (aw card, seg field, range slider).**

- [ ] **Step 2: Replace in wizards.css**
  - `.v2-aw-scrim` → `.v2-scrim--ember` in TSX.
  - `.v2-aw-card` surface → `.v2-panel`.
  - `.v2-aw-field`/`.v2-aw-seg`/`.v2-aw-opt`(+`.sel`) → `.v2-field`/`.v2-field-seg`/`.v2-opt`(+`.is-sel`). Update TSX class names accordingly.
  - `.v2-aw-go` ember button → `.v2-cta--ember`.
  - `.v2-aw-close` → `.v2-close`.
  - `.v2-aw-handle` hazard → `.v2-hazard` with `--v2-hazard-w:11px` via style/local.
  - selected-amber `#160f06` variant → drop; `.is-sel` covers it.
  - Keep range slider/band, dice preview — unique.

- [ ] **Step 3: Apply classes + rename `.sel`→`.is-sel` in wizard TSX.**

- [ ] **Step 4: Verify preview** (each wizard step, selected option state).

- [ ] **Step 5: Grep + commit**

Run: `grep -nE "#160f06|#f0663f|repeating-linear-gradient" client/src/v2/styles/wizards.css`
Expected: no matches.

```bash
git add client/src/v2/styles/wizards.css client/src/v2/**/*.tsx
git commit -m "refactor(v2): migrate wizards to primitives + tokens"
```

---

## Task 7: Migrate join.css

**Files:**
- Modify: `client/src/v2/styles/join.css`, `client/src/v2/screens/Join.tsx` (+ any subcomponents `grep -rl "v2-join\|v2-side" client/src/v2 --include=*.tsx`).

- [ ] **Step 1: Screenshot the join screen.**

- [ ] **Step 2: Replace in join.css**
  - `.v2-join-rivet` → `.v2-rivet`.
  - `.v2-join-cta` → `.v2-cta`.
  - `.v2-join-field` well → `.v2-well`.
  - `.v2-side.is-sel` → `.is-sel`.
  - `.v2-join-label`/`.v2-join-tagline`/`.v2-side-tag` → `.v2-eyebrow` (tagline keeps its wider spacing only if intentional; otherwise adopt `--v2-ls-eyebrow`).
  - `.v2-join-title` → `.v2-title`.
  - amber-sel `#241a0d→#1a1207` → `var(--v2-grad-oil-sel)` (or `.is-sel`).
  - hazard `::before` → `.v2-hazard` with `--v2-hazard-w:22px` or keep as unique bg using tokens.
  - CTA literals `#ffcf82`/`#7c4d14`/`#f0a94a` → tokens.

- [ ] **Step 3: Apply classes in Join TSX.**

- [ ] **Step 4: Verify preview** (both sides, selected state, CTA hover/disabled).

- [ ] **Step 5: Grep + commit**

Run: `grep -nE "#f0a94a|#ffcf82|#7c4d14|#07090c|#241a0d" client/src/v2/styles/join.css`
Expected: no matches.

```bash
git add client/src/v2/styles/join.css client/src/v2/**/*.tsx
git commit -m "refactor(v2): migrate join to primitives + tokens"
```

---

## Task 8: Migrate chat.css

**Files:**
- Modify: `client/src/v2/styles/chat.css` + chat component(s) (`grep -rl "v2-qm" client/src/v2 --include=*.tsx`).

- [ ] **Step 1: Screenshot the chat panel.**

- [ ] **Step 2: Replace in chat.css**
  - `.v2-qm-badge` → `.v2-badge`.
  - `.v2-qm-send` oil CTA → `.v2-cta`; `.v2-qm-mic` ember → `.v2-cta--ember`.
  - `.v2-qm-chip.sel` → `.is-sel` (rename in TSX).
  - `.v2-qm-sub`, think-summary eyebrows → `.v2-eyebrow`.
  - lamp dots (2s / 1s recording) → `.v2-lamp` with `--v2-lamp-speed` per state.
  - amber-user bg → `var(--v2-grad-oil-sel)`.
  - Keep message bubbles, markdown, think block — unique.

- [ ] **Step 3: Apply classes in chat TSX.**

- [ ] **Step 4: Verify preview** (send message, chips, recording lamp).

- [ ] **Step 5: Grep + commit**

Run: `grep -nE "#f0a94a|conic-gradient|#241a0d" client/src/v2/styles/chat.css`
Expected: no matches.

```bash
git add client/src/v2/styles/chat.css client/src/v2/**/*.tsx
git commit -m "refactor(v2): migrate chat to primitives + tokens"
```

---

## Task 9: Migrate forge.css

**Files:**
- Modify: `client/src/v2/styles/forge.css` + forge component(s) (`grep -rl "v2-fw\|v2-fc\|v2-fu" client/src/v2 --include=*.tsx`, includes `overlays/CommissionWizard.tsx`).

- [ ] **Step 1: Screenshot the forge/commission flow.**

- [ ] **Step 2: Replace in forge.css**
  - `.v2-fw-scrim` → `.v2-scrim--oil`.
  - `.v2-fw-card` surface → `.v2-panel`.
  - `.v2-fw-btn.cta` → `.v2-cta` (removes the second oil-button source of truth).
  - `.v2-fc-kind`/`.v2-fc-card`/`.v2-fc-node`/`.v2-fc-equip` selected states (4×) → `.is-sel`.
  - eyebrow labels (`.v2-fw-order`, `.v2-fc-cue-sub`, `.v2-fc-equip-family`, `.node-nature`, …) → `.v2-eyebrow`.
  - stencil (`.v2-fw-title`, `.kind-label`, `.codename`) → `.v2-title`.
  - `#05070a` bottom edges → `var(--v2-edge-dark)`; `.sel`→`.is-sel` in TSX.
  - `grid-template-columns` skeletons → `.v2-grid-2`/`.v2-grid-3` where they match.
  - Keep step rail, chassis dossier, upgrade tree — unique.

- [ ] **Step 3: Apply classes in forge TSX (rename `.sel`→`.is-sel`).**

- [ ] **Step 4: Verify preview** (kind select, node/equip select, CTA).

- [ ] **Step 5: Grep + commit**

Run: `grep -nE "#05070a|rgba\(231,154,61,\.4\)|#f0a94a" client/src/v2/styles/forge.css`
Expected: no matches.

```bash
git add client/src/v2/styles/forge.css client/src/v2/**/*.tsx
git commit -m "refactor(v2): migrate forge to primitives + tokens"
```

---

## Task 10: Migrate squadron.css

**Files:**
- Modify: `client/src/v2/styles/squadron.css` + squadron component(s) (`grep -rl "v2-yard\|v2-rigrow" client/src/v2 --include=*.tsx`).

- [ ] **Step 1: Screenshot the squadron/yard screen.**

- [ ] **Step 2: Replace in squadron.css**
  - `.v2-yard-readybtn` oil CTA → `.v2-cta`.
  - `.v2-rigrow-bar-track` well → `.v2-well`.
  - `.v2-yard-eyebrow`, `.v2-rigrow-short`, `.v2-bar-head` → `.v2-eyebrow`.
  - `.v2-yard-title`, `.v2-rigrow-name` → `.v2-title`.
  - `.v2-rigrow--hostile-stripe` hazard → `.v2-hazard` (`--v2-hazard-w:8px`).
  - class-bg `#0a0d11` (4×) → `var(--v2-well)`; bevels → `var(--v2-bevel-top)`; edges → `var(--v2-edge-dark)`.
  - `.v2-yard-add` dashed tape — keep unique or tokenize colors.
  - Keep rigrow anatomy, heat bars, yard bands — unique.

- [ ] **Step 3: Apply classes in squadron TSX.**

- [ ] **Step 4: Verify preview** (rig rows, hostile stripe, ready button disabled/enabled).

- [ ] **Step 5: Grep + commit**

Run: `grep -nE "#0a0d11|#f0a94a|#07090c|rgba\(255,255,255,\.0[34]\)" client/src/v2/styles/squadron.css`
Expected: no matches.

```bash
git add client/src/v2/styles/squadron.css client/src/v2/**/*.tsx
git commit -m "refactor(v2): migrate squadron to primitives + tokens"
```

---

## Task 11: Migrate rig-terminal.css

**Files:**
- Modify: `client/src/v2/styles/rig-terminal.css`, `client/src/v2/overlays/RigTerminal.tsx` (+ subcomponents `grep -rl "v2-rt\|v2-comp\|v2-heat" client/src/v2 --include=*.tsx`).

- [ ] **Step 1: Screenshot the rig terminal.**

- [ ] **Step 2: Replace in rig-terminal.css**
  - `.v2-rt-scrim` → `.v2-scrim--ember` (blur now applied via primitive).
  - `.v2-rt` surface (iron-800 variant) → `.v2-panel` (canonicalizes to `var(--v2-surface)`).
  - `.v2-rt::before/::after` rivets → `.v2-rivet` in TSX.
  - `.v2-rt-close` → `.v2-close`.
  - `.v2-comp-bar`, `.v2-heat-seg` wells → `.v2-well`; `border:1px solid #000` → `var(--v2-well-line)`.
  - `.v2-comp-step--dmg` ember tile → `var(--v2-grad-ember-well)` + `var(--v2-ember-deep)` border.
  - `.v2-comp-step--rep`/`.v2-rt-activate` green → `var(--v2-grad-green-well)` + `var(--v2-verdigris)`.
  - `.v2-heat-label`, `.v2-rt-mod` → `.v2-eyebrow`; `.v2-rt-name`, `.glyph` → `.v2-title` (glyph keeps `#8fbcff` — one-off, OK).
  - `#12161d` → `var(--v2-iron-850)`; `#0a0d11` → `var(--v2-well)`; oil-hatch head → keep, colors via `var(--v2-oil-deep)`.
  - Keep comp-bar hatch, hit/heal anims, heat gauge — unique.

- [ ] **Step 3: Apply classes in rig-terminal TSX.**

- [ ] **Step 4: Verify preview** (open terminal, damage/repair steps, heat gauge, rivets).

- [ ] **Step 5: Grep + commit**

Run: `grep -nE "#000\b|#12161d|#0a0d11|#26170f|#1c2a1c" client/src/v2/styles/rig-terminal.css`
Expected: no matches (except inside token-derived values you intentionally kept).

```bash
git add client/src/v2/styles/rig-terminal.css client/src/v2/**/*.tsx
git commit -m "refactor(v2): migrate rig-terminal to primitives + tokens"
```

---

## Task 12: Migrate overlay.css

**Files:**
- Modify: `client/src/v2/styles/overlay.css` + overlay component(s) (`grep -rl "v2-dwr\|v2-roll\|v2-rx" client/src/v2 --include=*.tsx` — Drawer, RollConsole, ReactionPicker, ChoiceField, battle bodies).

- [ ] **Step 1: Screenshot each overlay (drawer, roll console, reaction picker).**

- [ ] **Step 2: Replace in overlay.css**
  - `.v2-dwr-scrim` → `.v2-scrim`; `.v2-roll-scrim` → `.v2-scrim--oil`.
  - `.v2-dwr-card` + `.v2-roll-console` surfaces → `.v2-panel` (canonicalizes iron-800 variant).
  - `.v2-roll-console::before/::after` rivets → `.v2-rivet`.
  - `.v2-roll-close` → `.v2-close`.
  - `.v2-dwr-field`/`.v2-dwr-seg`/`.v2-dwr-opt`(+`.sel`) → `.v2-field`/`.v2-field-seg`/`.v2-opt`(+`.is-sel`).
  - `.v2-dwr-opt.sel`, `.v2-rx-choice.sel` → `.is-sel`.
  - die/rx-term/roll-form-input `border:1px solid #000` (4×) → `var(--v2-well-line)`; wells → `.v2-well`.
  - eyebrow labels (many dwr/roll/rx) → `.v2-eyebrow`; `.v2-roll-kind` → `.v2-title`.
  - `#05070a` edges → token; top-bevel `.04`/`.05` → `var(--v2-bevel-top)`.
  - `grid`/`repeat(3,1fr)` → `.v2-grid-3` where matching.
  - Keep dice tokens+anims, rx-break equation, flip coin — unique.

- [ ] **Step 3: Apply classes across overlay TSX files (rename `.sel`→`.is-sel`).**

- [ ] **Step 4: Verify preview** (drawer choices, roll dice, reaction pick, break equation).

- [ ] **Step 5: Grep + commit**

Run: `grep -nE "border:1px solid #000|#05070a|rgba\(255,255,255,\.0[45]\)|\.sel\b" client/src/v2/styles/overlay.css`
Expected: no matches.

```bash
git add client/src/v2/styles/overlay.css client/src/v2/**/*.tsx
git commit -m "refactor(v2): migrate overlay to primitives + tokens"
```

---

## Task 13: Migrate battle.css

**Files:**
- Modify: `client/src/v2/styles/battle.css` + battle component(s) (`grep -rl "v2-tb\|v2-ac\|v2-bh\|v2-outcome" client/src/v2 --include=*.tsx` — BattleHud, TurnBanner, OutcomeBanner, ActionConsole).

- [ ] **Step 1: Screenshot the battle HUD, turn banner, action console, outcome banner.**

- [ ] **Step 2: Replace in battle.css**
  - `.v2-outcome` scrim → `.v2-scrim--oil`; `.v2-outcome-new` surface (iron-800 variant) → `.v2-panel`.
  - `.v2-ac-tile[data-tone="ember"]` → `var(--v2-grad-ember-well)` + `var(--v2-ember-deep)`.
  - `.v2-bh-label`, `.impersonate` eyebrows → `.v2-eyebrow`; `.v2-outcome-text` → `.v2-title`.
  - CTAs → `.v2-cta`/`--ember`; bottom edges `#05070a`/`#120503` → `var(--v2-edge-dark)`.
  - top-bevel `.03` → `var(--v2-bevel-top)`; `.v2-ac-grid`/`repeat(3,1fr)` → `.v2-grid-3`.
  - Keep action-console deck, popover pointer, pips — unique.

- [ ] **Step 3: Apply classes in battle TSX.**

- [ ] **Step 4: Verify preview** (turn banner, action tiles/tones, outcome banner).

- [ ] **Step 5: Grep + commit**

Run: `grep -nE "#05070a|#120503|rgba\(255,255,255,\.03\)|linear-gradient\(180deg,var\(--v2-iron-800" client/src/v2/styles/battle.css`
Expected: no matches.

```bash
git add client/src/v2/styles/battle.css client/src/v2/**/*.tsx
git commit -m "refactor(v2): migrate battle to primitives + tokens"
```

---

## Task 14: Final sweep + verify targets

**Files:**
- Possibly touch any component CSS with leftover literals.

- [ ] **Step 1: Grep all v2 component CSS for raw hex**

Run:
```bash
grep -rnE "#[0-9a-fA-F]{6}" client/src/v2/styles --include=*.css | grep -v "tokens.css"
```
Expected: empty, OR only documented one-off accents (e.g. `#8fbcff` rig glyph). For each remaining hex, either replace with a token or record it as an accepted one-off in a comment.

- [ ] **Step 2: Grep for re-implemented patterns**

Run:
```bash
grep -rnE "backdrop-filter:blur|conic-gradient|repeating-linear-gradient|rgba\(231,154,61,\.4\)" client/src/v2/styles --include=*.css | grep -v -E "tokens.css|primitives.css"
```
Expected: empty (all scrim-blur, badges, hazards, oil-rings now live in primitives/tokens).

- [ ] **Step 3: Line-count check**

Run: `wc -l client/src/v2/styles/*.css | tail -1`
Expected: total ~2100–2300 (down from 3339). If still >2400, revisit the largest files for missed dedup.

- [ ] **Step 4: Full preview pass**

Open every v2 screen in sequence: join, forge/commission, squadron, battle (HUD/turn/action/outcome), rig terminal, overlays (drawer/roll/reaction), wizards, chat, glossary. Screenshot each. Confirm no regression and consistent scrim/panel/CTA/eyebrow/lamp rendering. Check `read_console_messages` clean.

- [ ] **Step 5: Commit any sweep fixes**

```bash
git add client/src/v2/styles
git commit -m "refactor(v2): final CSS sweep — no raw literals, patterns unified"
```

---

## Self-review notes (already applied)

- **Spec coverage:** tokens (Task 1), primitives (Task 2), all 11 component files (Tasks 3–13), regression sweep + success criteria (Task 14). Every A–P pattern and every §2 token maps to a task.
- **Naming consistency:** selected state is `.is-sel` everywhere (old `.sel` renamed in TSX per task); segmented field is `.v2-field`/`.v2-field-seg`/`.v2-opt` across wizards + overlay; scrim variants `--oil`/`--ember`; panel `--sharp`.
- **Known one-offs allowed:** `#8fbcff` (rig glyph) and any single-use accent may remain with a comment; Task 14 documents them rather than forcing a token.
