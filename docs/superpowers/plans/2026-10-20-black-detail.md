# Black detailed inspection model implementation plan

> Execute inline with superpowers:executing-plans. Repository rules override worktree and intermediate-commit instructions: shared main, one final commit.

**Goal:** Give Black the same detailed geometry and distinct material treatment as Tyrian while retaining its tank-casemate identity and shield clearance.

**Architecture:** Opt-in hero geometry extends the existing Black tank walker. Extract Tyrian's reusable geometry/batching helpers, add a Black-specific machinery builder, and expose both chassis in the existing material lab. Standard gameplay geometry stays light; material treatment stays in the lab, matching the approved guide.

**Tech stack:** Existing Three.js procedural meshes, image PBR maps, Vite and node:test. No dependencies.

**Spec:** [Rig remodeling guide](../../design/rig-remodeling-guide.md), requested by the maintainer as the standard for Black.

## Constraints and review focus

- Roughly 40k triangles: 35k–45k across five skins; aim below 160 visible meshes. Existing Black standard geometry unchanged.
- Keep Black's sloped casemate/cupola, Siege Maul and Bulwark Shield; physical base, muzzle, damage locations and movement contracts unchanged.
- Preserve Black's current shake; Tyrian's approved .11/.82 unchanged. No new glare or per-detail lights.
- Check shield/body/leg clearance through walking and full bash; all added shield hardware follows its group.
- New cooling rotor must clear its fixed cage/supports and stop with engine state.
- Skins must not seal hollow stacks; mounts must contact armor and move with it.
- All six material families keep distinct source maps and smooth normals; switching chassis/skin must not mix recipes.
- Standard/hero comparison and portable export must work for both chassis; shader/texture errors must not leave a blank preview.

## Task 1: Geometry and mechanics

Files: new `client3d/src/scene/rig/black-detail.js`, `detail-kit.js`, `black-detail.test.js`; modify `tank-walker.js`, `tyrian-detail.js`.

- [x] Add failing hero budget/identity tests for all Black skins, animated shield clearance and fan stop/resume/attachment checks.
- [x] Run focused tests and observe missing hero behavior.
- [x] Extract unchanged shared refinement/batching helpers. Add shaped armor fittings, cupola hatch/periscopes, engine service hardware, guarded driven fan, hollow exhausts, leg bearings/suspension, cannon and shield detail.
- [x] Enable Black hero path and preserve standard output. Verify tests and Tyrian regression.

## Task 2: Materials and lab

Files: `material-tuner.js`, `material-tuner.html`, `export-material-tuner.mjs`, `material-study.test.js`.

- [x] Extend coverage/smooth-normal/restoration checks to Black hero across skins.
- [x] Add chassis selection and chassis-specific recipe persistence/export, reuse the existing six texture sets and guards. Support `?chassis=Black` and portable Black default.
- [x] Verify browser chassis/skin/detail switching, material controls, original comparison and glare modes.

## Task 3: Validation and record

- [x] Run `node --test --test-reporter=dot "client3d/**/*.test.js"` and direct Vite 3D build.
- [x] Review front/rear/weapon sides, skins, animation and console. Save screenshots and export `black-material-lab.html`.
- [x] Fresh review of task files, resolve actionable issues, record measurements and update roster guide.
- [x] Stage only this task and commit once.

## Execution ledger

- Baseline HEAD: `69e9068`. Unrelated gameplay/deployment edits already dirty; excluded from this task.
- Scope decision: match Tyrian's inspection/lab deployment boundary, not silently enable hero/PBR on every battlefield model.
- Pre-flight: geometry produces `detail: 'hero'`, existing material study consumes the completed rig without chassis-specific texture loading. Lab cache and persistence must include chassis.
- Red phase: all three new Black tests failed on missing hero/fan behavior before implementation. The first implementation exceeded 45k on Rust; economical cooling rings and service covers brought all skins within budget.
- Final geometry: browser counts range from 42,638 to 44,120 triangles and 121 to 149 meshes. Ace is 43,325 / 147 versus standard 8,577 / 132. Tyrian Ace remains 41,059 / 138.
- Validation resumed after the tool environment interrupted an earlier run: complete 3D suite passed (147 tests), direct Vite 3D build passed, portable export built successfully. Independent review reran the 26 focused tests and found no important/critical defects; reviewed fan/cage clearance and open skin collars geometrically.
- Browser checks: all five skins, front/rear/weapon-side/elevated angles, Workshop/Foundry Dusk/Glare Check, material controls, chassis-specific reload persistence, comparison, detail switching and pause/resume. No browser warnings/errors. Standalone HTML also rendered through a temporary HTTP preview; that preview server was stopped after validation.
- Record and screenshots: [Black rollout](../../design/black-remodeling.md); shared guide and roster updated. Black retains its previous 1/1 shake, with no new approval implied. Hero gameplay promotion and battle FPS profiling remain separate work.
