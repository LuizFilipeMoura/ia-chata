# Phase 2 Weapons + Agentic Gather Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete Phase 2 by enforcing strict structured weapons, Light/Medium-only creation, and Gemma gather-before-add behavior.

**Architecture:** `shared/game-state.js` remains the authoritative pure logic module for valid classes, weapon lists, canonicalization, and `add` validation. `server/prompt.js` documents the exact structured `RIG add` protocol and teaches Gemma to gather missing fields before tagging. The manual UI continues to render server state and only exposes valid class/weapon choices.

**Tech Stack:** Node 18+ ESM, Express, built-in `node:test`, vanilla browser JS.

## Global Constraints

- Use structured weapons only: `weapons.longRange` and `weapons.melee`.
- Valid weapons come from `WEAPONS` in `shared/game-state.js`.
- Server weapon matching is case-insensitive exact matching only.
- Gemma may map imperfect player wording to valid code weapon names before tagging.
- No unknown/custom weapons.
- No post-creation weapon edits and no `RIG weapons` command.
- Creation supports only `light` and `medium`; `heavy` and `colossal` are blocked for now.
- Invalid add commands are no-ops with no version bump and no `nextRigId` burn.

---

## File Structure

- Modify `shared/game-state.js`: add supported creation class validation and keep weapon canonicalization strict.
- Modify `shared/game-state.test.js`: update existing Heavy-based creation tests to Light/Medium and add explicit Heavy/Colossal rejection tests.
- Modify `public/index.html`: hide Heavy/Colossal from the manual class selector and update helper copy.
- Modify `public/ui-static.test.js`: assert the manual class selector only exposes Light/Medium.
- Modify `server/prompt.js`: document structured `RIG add`, valid weapon lists, gather-before-act rules, and unsupported Heavy/Colossal handling.

---

## Task 1: Enforce supported creation classes in shared logic

**Files:**
- Modify: `shared/game-state.js`
- Test: `shared/game-state.test.js`

**Interfaces:**
- Consumes: `WEAPONS`, `normalizeWeapon(category, name)`, `makeRig(id, name, cls, owner, weapons)`, `applyCommand(room, cmd, context)`.
- Produces: `SUPPORTED_RIG_CLASSES`, strict `makeRig` null return for unsupported classes, and `applyCommand` no-op behavior for invalid adds.

- [ ] **Step 1: Write failing tests**

Add tests that expect Light/Medium adds to succeed and Heavy/Colossal adds to fail without bumping `version` or consuming `nextRigId`.

- [ ] **Step 2: Run focused tests**

Run: `node --test shared/game-state.test.js`

Expected: FAIL until `heavy` and `colossal` creation are blocked.

- [ ] **Step 3: Implement supported-class validation**

Add `SUPPORTED_RIG_CLASSES = ["light", "medium"]`, normalize classes in `makeRig`, return `null` for unsupported classes, and keep weapon canonicalization unchanged.

- [ ] **Step 4: Run focused tests**

Run: `node --test shared/game-state.test.js`

Expected: PASS.

---

## Task 2: Hide unsupported classes in manual UI

**Files:**
- Modify: `public/index.html`
- Test: `public/ui-static.test.js`

**Interfaces:**
- Consumes: `<select id="rigClass">` and `public/ui-static.test.js` static HTML assertions.
- Produces: manual add form with only `light` and `medium` options.

- [ ] **Step 1: Write failing static test**

Assert that the class selector includes Light/Medium and does not include Heavy/Colossal options.

- [ ] **Step 2: Run UI static tests**

Run: `node --test public/ui-static.test.js`

Expected: FAIL while Heavy/Colossal options remain in `index.html`.

- [ ] **Step 3: Update class selector and copy**

Remove Heavy/Colossal options from the selector and update the hint copy so it no longer tells players to add a Heavy Rig.

- [ ] **Step 4: Run UI static tests**

Run: `node --test public/ui-static.test.js`

Expected: PASS.

---

## Task 3: Update Gemma tracker protocol

**Files:**
- Modify: `server/prompt.js`

**Interfaces:**
- Consumes: exported `TRACKER_PROTOCOL` string.
- Produces: prompt text that documents the structured `RIG add` tag and gather-before-act rules.

- [ ] **Step 1: Update protocol command documentation**

Change `RIG add` to include `class="light|medium"`, `lr="<long-range weapon>"`, and `melee="<melee weapon>"`.

- [ ] **Step 2: Add gather and validation rules**

Document that Gemma must ask for every missing field at once, emit no tag for incomplete or invalid adds, use only the code weapon names, map imperfect wording only when clear, and refuse Heavy/Colossal for now.

- [ ] **Step 3: Run full tests**

Run: `npm test`

Expected: PASS.

---

## Task 4: Final verification

**Files:**
- Verify: `shared/game-state.js`, `server/prompt.js`, `public/index.html`, `public/ui-static.test.js`, `shared/game-state.test.js`

- [ ] **Step 1: Run full suite**

Run: `npm test`

Expected: PASS.

- [ ] **Step 2: Review diff**

Run: `git diff -- shared/game-state.js shared/game-state.test.js public/index.html public/ui-static.test.js server/prompt.js`

Expected: only Phase 2 changes are present.
