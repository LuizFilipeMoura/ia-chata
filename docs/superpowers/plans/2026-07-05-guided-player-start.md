# Guided Player Start Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add prompt-backed guided start behavior so Gemma can help one current player register three glued minis as playable Rigs, then guide deployment.

**Architecture:** Implement as a new exported prompt section in `server/prompt.js`, appended to the chat system prompt alongside the rulebook, tracker protocol, and current battle state. Cover the behavior with `node:test` assertions in `server/prompt.test.js`.

**Tech Stack:** Node.js ES modules, built-in `node:test`, existing prompt string composition.

## Global Constraints

- Gemma is talking to one player at a time and must help only the current player's own side.
- Minis already have glued weapons; Gemma maps visible descriptions to legal profiles instead of optimizing loadouts.
- Ambiguous weapon descriptions require 2-3 likely legal matches and no rig creation tag until the player chooses exact profiles.
- A guided player start requires 3 complete own-side Light/Medium Rigs before moving to deployment.
- Only Light and Medium are supported creation classes.

---

### Task 1: Add Guided Start Prompt Contract

**Files:**
- Modify: `server/prompt.test.js`
- Modify: `server/prompt.js`
- Test: `server/prompt.test.js`

**Interfaces:**
- Consumes: existing `TRACKER_PROTOCOL` and `WEAPONS` exports.
- Produces: exported `PLAYER_START_GUIDE: string`, included in `/api/chat` system prompt.

- [ ] **Step 1: Write the failing tests**

Add tests in `server/prompt.test.js`:

```js
import { TRACKER_PROTOCOL, PLAYER_START_GUIDE } from "./prompt.js";

test("player start guide documents one-player guided rig registration", () => {
  assert.match(PLAYER_START_GUIDE, /one player at a time/i);
  assert.match(PLAYER_START_GUIDE, /current player's side/i);
  assert.match(PLAYER_START_GUIDE, /3 complete own-side Rigs/i);
  assert.match(PLAYER_START_GUIDE, /Light or Medium/i);
});

test("player start guide requires strict weapon disambiguation before creating rigs", () => {
  assert.match(PLAYER_START_GUIDE, /2-3 likely legal matches/i);
  assert.match(PLAYER_START_GUIDE, /glued/i);
  assert.match(PLAYER_START_GUIDE, /Do not emit.*\[\[RIG add/s);
  assert.match(PLAYER_START_GUIDE, new RegExp(WEAPONS.longRange.join(".*"), "s"));
  assert.match(PLAYER_START_GUIDE, new RegExp(WEAPONS.melee.join(".*"), "s"));
});

test("player start guide hands off to deployment after registration", () => {
  assert.match(PLAYER_START_GUIDE, /terrain/i);
  assert.match(PLAYER_START_GUIDE, /three objectives/i);
  assert.match(PLAYER_START_GUIDE, /deploy/i);
  assert.match(PLAYER_START_GUIDE, /score objectives/i);
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```powershell
C:\Users\breke\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe --test server\prompt.test.js
```

Expected: fail because `PLAYER_START_GUIDE` is not exported.

- [ ] **Step 3: Implement the prompt section**

In `server/prompt.js`, export a `PLAYER_START_GUIDE` string after `TRACKER_PROTOCOL`. It must include trigger phrases, one-player scope, gather-confirm-create rules, strict weapon disambiguation, and deployment handoff.

- [ ] **Step 4: Inject the prompt section into chat**

In `server/routes/chat.js`, import `PLAYER_START_GUIDE` and append it between `TRACKER_PROTOCOL` and `battle`.

- [ ] **Step 5: Run prompt tests**

Run:

```powershell
C:\Users\breke\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe --test server\prompt.test.js
```

Expected: all prompt tests pass.

- [ ] **Step 6: Run full suite**

Run:

```powershell
C:\Users\breke\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe --test
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```powershell
git -c safe.directory=C:/Users/breke/WebstormProjects/ia-regrinha add server\prompt.js server\routes\chat.js server\prompt.test.js docs\superpowers\plans\2026-07-05-guided-player-start.md
git -c safe.directory=C:/Users/breke/WebstormProjects/ia-regrinha commit -m "feat: guide new player rig setup"
```
