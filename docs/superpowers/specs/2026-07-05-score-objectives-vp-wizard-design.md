# Score Objectives — VP Wizard (design)

**Date:** 2026-07-05
**Status:** Approved, ready for planning

## Problem

During the Recovery Phase (§4/§11), each side scores the VP value of every
objective marker it controls. The backend already supports this: the `vp`
command runs during the `recovery` phase, records a per-side score, and
`advanceRound` fires only once **both** sides have submitted — so "only start
the next round after both players input" is already enforced, and the UI
already shows *"Waiting for opponent to score…"*.

The weak spot is the **input UI**. Today scoring is a raw
`window.prompt("Victory points scored this Recovery…")` that asks for a single
number (`client/src/state/BattleActionsContext.tsx`). It is error-prone, ugly,
and does nothing to help players agree on who holds what.

## Goal

Replace the number-prompt with a proper wizard that asks **"What points do you
control?"**, presents the **3 objective markers** as toggles, tallies VP, and
submits each side's **per-objective claims** so the server can **detect and
block on conflicts** (both sides claiming the same marker) before advancing.

## Input model (the key idea)

The wizard lists the three markers from `game.objectives` (index 0 = centre,
2 VP; indices 1–2 = the two empty-corner markers, 1 VP each — per
`computeObjectives` in `shared/field.js`):

- **Centre · 2 VP**
- **Corner · 1 VP** (×2, disambiguated by a position hint derived from each
  marker's x/y so it matches the FieldMap)

Each player **selects the markers they control** (their rig within 2",
uncontested). A live total reads *"You'll score X VP."* Submit sends the
**selected marker indices**, not a scalar number.

The three §11 control outcomes then fall out for free:

- Exactly **one** side selects a marker → that side scores its VP.
- **Neither** side selects it → contested *or* empty → nobody scores (correct
  either way).
- **Both** sides select it → genuine disagreement → **conflict, blocked**.

Players never need a separate "contested" control — a contested marker is
simply one that *neither* side claims.

## Backend — state shape & command (`shared/game-state.js`)

- Replace the `recoveryVp` boolean map with
  **`recoveryClaims: Record<side, number[]>`** — the objective indices each
  side claims. Key-present = that side has submitted.
- Add **`recoveryConflict: number[] | null`** — indices claimed by both sides,
  set only when both have submitted *and* their claims overlap; `null`
  otherwise.
- The `vp` command's attrs change from `{ side, points }` to
  **`{ side, claims: number[] }`**. Indices are validated against
  `game.objectives` (integer, in range) and de-duplicated; anything invalid is
  dropped. An empty array (controls nothing) is valid.
- Update the four reset sites that currently touch `recoveryVp`
  (createGame `~209`, ensureGameShape `~271`, runRecovery `~639`, reset `~917`)
  to initialise `recoveryClaims = {}` and `recoveryConflict = null`.

## Server resolution logic

On each `vp` submit while `phase === "recovery"`:

1. Resolve the acting side (`normalizeSide(a.side)` / context), validate and
   store `recoveryClaims[side] = claims` — **overwriting** any prior claim so a
   side can **resubmit to fix a conflict**.
2. If **both** sides have now submitted (both keys present):
   - Compute the overlap of the two claim sets.
   - **Overlap non-empty →** set `recoveryConflict = overlap`, do **not**
     advance. Both players remain in recovery to re-check.
   - **Overlap empty →** clear `recoveryConflict`; for each side add
     `sum(objectives[i].vp for i in claims)` to `side.vp`; call
     `advanceRound(room)`.

Because claims are always overwritten and the resolution re-runs on every
submit, a conflict resolves as soon as one side removes the disputed marker and
resubmits. Once `advanceRound` runs the phase leaves `recovery`, so no further
submits are accepted.

Claims are not secret in a shared-table game, so `recoveryClaims` /
`recoveryConflict` are visible to both sides in public state (no redaction).

## Client — wizard + wiring

- **New `client/src/components/wizards/VpWizard.tsx`**, styled like
  `AttackWizard` (reuse the `aw-scrim` / `aw-card` modal shell or a sibling
  stylesheet). Contents:
  - Title *"⟡ Score Objectives — Round N"*, prompt *"What points do you
    control?"*
  - The 3 markers as toggle buttons, each with a VP badge, label, and
    position hint matching the FieldMap.
  - Disputed markers (present in `recoveryConflict`) highlighted with a warning
    (*"You and your opponent both claimed this — one of you must change."*).
  - Live total; primary button **"Score X VP"** →
    `sendCommand("vp", { side: mySide(), claims: selectedIndices })`, then
    close.
  - Prefills selection from `recoveryClaims[mine]` when reopened (after a
    submit or on conflict).
- **`WizardContext`**: add an `openScore()` method and a `{ kind: "score" }`
  open state that renders `VpWizard` via the existing portal.
- **`BattleActionsContext.scoreVp`**: call `openScore()` instead of
  `window.prompt`.
- **`computeFocus`** recovery branch becomes three states for "me":
  - conflict present → `act` CTA *"Objectives disputed — re-check"*
    (`kind: "score"`, reopens the prefilled wizard with disputed markers
    flagged);
  - submitted, no conflict → `wait` *"Waiting for opponent to score…"*;
  - not submitted → `act` CTA *"Score your objectives"* (`kind: "score"`).
- **`client/src/state/types.ts`**: swap `recoveryVp` for
  `recoveryClaims?: Record<string, number[]>` and add
  `recoveryConflict?: number[] | null`.

## Testing

- **`shared/game-state.test.js`**:
  - non-overlapping claims → correct per-side totals and `advanceRound`;
  - overlapping claims → `recoveryConflict` set, no advance, VP and round
    unchanged;
  - resubmit that removes the overlap → advances with correct VP;
  - invalid / out-of-range / duplicate indices dropped; empty claim allowed.
- **Client**:
  - `VpWizard.test.tsx` — renders 3 toggles, tallies the total, submits the
    selected indices;
  - `computeFocus` — the three recovery/conflict states.

## Non-goals / notes

- **Breaking contract change:** the `vp` command drops the scalar `points`
  attr entirely in favour of `claims`. Acceptable — pre-release, and the only
  caller is the current `scoreVp`.
- **Ironclad Bounty** (§11 optional, +2 VP) is out of scope; it scores on rig
  destruction, not during recovery.
- No AI/agentic involvement — this is a deterministic scoring UI over existing
  state.
