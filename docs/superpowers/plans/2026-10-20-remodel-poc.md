# 3D Remodeling POC Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development or superpowers:executing-plans. User has approved execution of the full POC.

**Goal:** Deliver two tank walkers with five skins and a matching industrial environment, visible in one comparison hall and used by normal asset builders.

**Architecture:** Keep the existing procedural model contracts. Add focused remodel builders and explicit development-only legacy selection. Separate ownership between rig assets, environment assets, and preview integration. Preserve gameplay semantics and rendering protections.

**Tech Stack:** JavaScript, Three.js, Vite, node:test.

**Spec:** `docs/superpowers/specs/2026-10-20-remodel-poc-design.md`

## Global constraints

- Work on shared main; no branches, worktrees, stash or intermediate commits.
- Preserve roughness floor 0.7 and local-light cap 4.
- Existing unrelated dirty files must not enter the task commit.
- TDD for mechanical math/state transitions; visual construction verified in browser and existing geometry tests.

## Review focus

- Engine stop/resume at shutdown, broken engine and destroyed states must not snap or keep driving linkages.
- All five skins and maximum wear must stay within the new explicit chassis art envelope and gameplay base footprint.
- Moving links must remain attached at action/walk extremes.
- Narrow building/terrain dimensions must retain bounds.
- Comparison mode and UI switching must dispose callbacks/resources and preserve normal game construction.

## Task 1: Rig remodeling

Owner: rig agent. Files: new `scene/rig/tank-walker.js` and tests; `rig/body.js`, `rig/skins.js`, `rig/envelope.js`, `scene/mechs.js` as needed.

- [x] Test connected linkage geometry, stopped engine behavior and POC chassis footprint.
- [x] Run tests and observe intended failures.
- [x] Implement Black/Tyrian bodies, weapon dressing, localized materials/wear and skin attachments. `new Mech({ remodel: false, ... })` builds legacy reference; default uses remodel for these two.
- [x] Preserve existing rig animation/socket API. Add explicit per-frame mechanical update called after pose changes.
- [x] Run rig tests and all skin/envelope checks.

## Task 2: Environment remodeling

Owner: environment agent. Files: focused new environment builders/tests; `dressing.js`, `scenery.js`, `objectives.js`, `props.js` if needed.

- [x] Test pump linkage closure, finite animation and existing footprint bounds at narrow/default sizes.
- [x] Observe failure, then implement mechanically connected pumphouse, masonry ruins, drums, sandbags and scrap.
- [x] Refine refinery using matte materials and preserve signals. Normal builders use remodel; `ctx.remodel === false` selects old versions for development comparison where practical.
- [x] Export `industrialGround(w, d)` from `scene/industrial-ground.js` for coherent ground dressing in the POC scene.
- [x] Run props/scenery tests and new tests.

## Task 3: POC presentation and integration

Owner: parent. Files: `ui/devroom.js`, new `ui/remodel-poc.js`, dev-room styles and focused tests if needed.

- [x] Add POC hall reachable by `#dev=poc.scene`.
- [x] Assemble both chassis, all skins, state/action controls and legacy comparisons with environment.
- [x] Add readable runtime geometry/draw-call/frame-time readout and reproducible view controls.
- [x] Preserve rendering guardrails; tune modest preview diffuse fill and inspect representative themes.
- [x] Capture before/after and animation evidence, check logs and build.

## Task 4: Review and delivery

- [x] Independent code review of owned changes; fix findings.
- [x] Run relevant node tests, 3D production build and broader required checks once.
- [x] Record measured limits and verification in this plan.
- [x] Stage task files/hunks only; deliver this plan with the single POC commit.

## Validation record

- Shared/game/server/script tests: 1,226/1,226 passed.
- TypeScript: `node node_modules/typescript/bin/tsc --noEmit` passed.
- Vitest: 318/319 passed. Existing V2 `LoadoutView.test.tsx:32` expects "Depleted Core"; this task does not change V2 or its data. Initial sandbox temp-cache rename errors were bypassed by putting TEMP/TMP in ignored `node_modules/.cache/remodel-tests` and using four workers.
- Production build uses `node node_modules/vite/bin/vite.js build --config client3d/vite.config.js`. The existing unrelated package script contains `vi te.config.js`; it is deliberately excluded from this task.
- Live review requested distinct tank/truck torsos, stronger diesel chug, normal-game smoke, and shield clearance. Regression coverage now includes moving shield/body separation, action footprints, planted feet during chug and stopped exhaust.
- Renderer roughness floor, local-light cap, exposure and bloom settings remain intact. POC adds diffuse fill and hides preview rain without changing saved weather preferences.
- Final 3D suite: 117/117 passed. Direct Vite production build passed (126 modules).
- Independent final review passed after correcting thin-profile bevels, projecting skin markings onto the new hull surfaces, and disabling action controls when the engine is stopped.
- Browser checks covered both hulls, skins, state controls, the comparison hall, three lighting themes and return to the normal asset gallery. Shutdown disables Walk/Fire/Swing. Final preview console had no errors.
- Review-yard asset cost: 1,380 draws / about 161k triangles, compared with 1,396 / about 79k before. Increased geometry buys shaped hulls and machinery; batching reduces asset draw calls slightly. Renderer frame draws also include shadows and post-processing.
- Observed foreground intervals were roughly 10–16 ms; background browser throttling produced roughly 1,000 ms intervals. These are browser cadence observations, not a controlled performance benchmark.
- Black skins cost 99–122 meshes / 7,194–8,224 triangles; Tyrian skins cost 106–132 meshes / 10,742–11,852 triangles. Full-action radial extents stayed within physical bases (Black 1.407 / 1.48, Tyrian 1.173 / 1.18).
- Screenshots (`pumphouse-before.png`, `pumphouse-after.png`, `black-remodel.png`, `tyrian-remodel.png`, `remodel-yard.png`) and an eight-second capture (`diesel-idle.webm`) are saved in the task visualization directory. The capture is affected by background throttling; live gallery controls are the better motion reference.
