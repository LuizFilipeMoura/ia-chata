# Dieselpunk Model Variants Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Per-chassis dieselpunk rig bodies from a shared part library, 5 skins, per-template walker/drone bodies and new set dressing, all inside today's model sizes.

**Architecture:** A `client3d/src/scene/rig/` module builds bodies from recipes (`recipes.js`) out of parts (`parts.js`, `support.js`), dressed by skins (`skins.js`), all sharing primitives from `kit.js`. `Mech` keeps base / animation / state and delegates body geometry to `buildRigBody`. `envelope.js` holds the legacy size limits; node tests hold every model to them.

**Tech Stack:** three 0.186, plain ES modules, `node --test`.

**Spec:** `docs/superpowers/specs/2026-09-26-dieselpunk-model-variants-design.md`

## Global Constraints

- Envelope (root space, weapons excluded, rest pose), measured from the pre-change models on 2026-09-26: light height 1.922 radius 0.461; medium height 2.184 radius 0.660; walker height 2.712 radius 0.516; drone height 1.313 radius 0.370. Radius = max horizontal vertex distance from the base centre.
- Base radii unchanged (`BASE_RADIUS` in `shared/geometry.js`).
- Weapon tables `LR`, `MELEE`, `UNIT_GUNS`, `MODULE_TOOLS` unchanged.
- No em dashes anywhere (code comments, docs, commits).
- No pinned dimension numbers in tests beyond `envelope.js`.
- `package.json`: touch only the `test` script. Another agent's unrelated `build:3d` edit must not be committed by us.
- One commit per stage, `git add` explicit paths only.

---

## Stage 1: Rigs

### Task 1: Headless-safe Mech + kit extraction + test harness

**Files:**
- Create: `client3d/src/scene/rig/kit.js` (mat cache, STEEL/DARK/BRASS, at/box/cyl/sph/cone/barrel/torus helpers, `canvasTexture(draw)` returning null without a DOM)
- Modify: `client3d/src/scene/mechs.js` (import helpers from kit; `stripeTexture` and `makeSpentToken` fall back to plain materials headless)
- Modify: `package.json` test script: add `"client3d/**/*.test.js"` to the `node --test` globs
- Test: `client3d/src/scene/rig/rig.test.js`

**Interfaces:**
- Produces: `kit.js` exports `THREE`, `mat(color, opts)`, `STEEL()`, `DARK()`, `BRASS()`, `at(o,x,y,z,rz)`, `box(w,h,d,m)`, `cyl(rt,rb,h,m,seg)`, `sph(r,m,seg)`, `cone(r,h,m,seg)`, `barrel(r,len,m)`, `torus(r,t,m,arc)`, `canvasTexture(size, draw)`, `hasDOM`.

- [ ] Step 1: failing test: `new Mech({...Gold light})` constructs under node.
- [ ] Step 2: run `node --test client3d/src/scene/rig/rig.test.js`, expect `document is not defined`.
- [ ] Step 3: extract kit, guard canvas use.
- [ ] Step 4: test passes.

### Task 2: Envelope + measurement helper

**Files:**
- Create: `client3d/src/scene/rig/envelope.js`
- Test: `client3d/src/scene/rig/rig.test.js`

**Interfaces:**
- Produces: `ENVELOPE = { light:{height,radius}, medium:{...}, walker:{...}, drone:{...} }`, `measureBody(mech) -> { height, radius, bottom }` (detaches weapon groups while measuring), `fits(mech) -> { ok, height, radius, limit }`.

- [ ] Step 1: failing test: every chassis Mech `fits`.
- [ ] Step 2: implement; legacy models pass (they define the envelope).

### Task 3: Part library + recipes + body builder

**Files:**
- Create: `client3d/src/scene/rig/parts.js` (TORSOS, HEADS, BACKPACKS, LEGS, FEET, SHOULDERS, SIGNATURES registries of builders)
- Create: `client3d/src/scene/rig/recipes.js` (`RECIPES[codename]`)
- Create: `client3d/src/scene/rig/body.js` (`buildRigBody`)
- Modify: `client3d/src/scene/mechs.js` rig path uses `buildRigBody`
- Test: `rig.test.js`

**Interfaces:**
- Part builder signature: `(ctx) => void`, adding meshes to `ctx.torso` / `ctx.pelvis` / leg groups and registering `ctx.sockets[name] = Object3D`, `ctx.stacks.push(mesh)`.
- `ctx = { cls, heavy, paint, trim, glass, vent, torso, pelvis, sockets, stacks, dims:{w,h,d}, seed, rng }`.
- Leg builder: `(ctx, side) => { hip, knee, foot, rest:{hip,knee}, height }` where `height` is the rest-pose drop from hip to sole.
- `buildRigBody({ cls, codename, paint, skin, seed }) -> { pelvis, legs, torso, chest, armR, armL, stacks, cockpitMat, ventMat, hipH, sockets }`.

Tests:
- Contract: every codename's Mech exposes the body contract, `stacks.length >= 1`, all 7 sockets.
- Envelope: every codename fits its class.
- Variety: within a class torso / head / backpack unique, leg+foot unique, signatures unique across all; every `CHASSIS` name has a recipe.

### Task 4: Skins

**Files:**
- Create: `client3d/src/scene/rig/skins.js` (`SKINS`, `SKIN_IDS`, `applySkin(body, skinId, ctx)`, `skinFor({ mode, fixed, map, side, codename, seed })`)
- Modify: `body.js` applies skin; `mechs.js` accepts `skin` option
- Test: `rig.test.js`

Tests: every chassis x skin builds and fits; seeded add-on layout differs across two ids for Field Refit; `skinFor` modes.

### Task 5: Setting, director wiring, dev room

**Files:**
- Modify: `client3d/src/settings.js` (`rigSkinMode: "side"`, `rigSkin: "factory"`, `rigSkinMap: {}`)
- Modify: `client3d/src/game/director.js` (`ensureMech` passes `skin: skinFor(...)`)
- Modify: `client3d/src/main.js` settings panel: skin mode + fixed skin selects
- Modify: `client3d/src/ui/devroom.js` chassis grid 14 x 5, parts row, envelope readout in card

Verify in the browser preview: dev room renders, no console errors.

- [ ] Commit Stage 1.

---

## Stage 2: Support units

### Task 6: Walker + drone bodies

**Files:**
- Create: `client3d/src/scene/rig/support.js` (`WALKER_BODIES[templateId]`, `DRONE_BODIES[droneId]`)
- Modify: `mechs.js` `buildSupport` uses them (template id passed as `template` option); skins apply
- Modify: `director.js` passes `template: r.template`; `devroom.js` passes template ids
- Test: every walker template / drone type fits its envelope, has contract, bodies are distinct.

- [ ] Commit Stage 2.

---

## Stage 3: Set dressing

### Task 7: Buildings + small terrain

**Files:**
- Modify: `client3d/src/scene/props.js` (`pumphouse`, `gasholder`, `signalbox`, `pylon`, `pillbox` in `BUILDINGS`; `sandbagProp`, `drumsProp`, `hedgehogProp`, `spoolsProp`, `carcassProp` variants chosen deterministically inside `barricadeProp` / `crateProp` / `rubbleProp`)
- Modify: `client3d/src/scene/themes.js` building mixes
- Modify: `devroom.js` shows new kinds and each small-terrain variant
- Test: `client3d/src/scene/props.test.js`: each building kind fits its rect footprint and the legacy building height range; each small variant fits its rect and legacy prop height.

- [ ] Commit Stage 3.
