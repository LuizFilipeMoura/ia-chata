# Ready Bounty Start Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Ready gate that starts the battle when both players are ready and privately assigns each side a random enemy Ironclad Bounty.

**Architecture:** Keep the room as the authoritative source of truth in `shared/game-state.js`. Add side-aware public state filtering so the server stores both bounties but each client receives only its own. Add a compact setup/status block to the existing Rig panel rather than a separate screen.

**Tech Stack:** Node.js 18+, Express, browser ES modules, `node:test`.

## Global Constraints

- Work directly on `main`; do not create branches or worktrees.
- Commit every significant change.
- A side can only become Ready when it owns at least three tracked Rigs.
- The game starts automatically once both sides are Ready.
- Each side's bounty is selected randomly from the opponent's current Rigs.
- The opponent's bounty must not be sent to that player's browser.
- If Rigs are added or removed before the game starts, both Ready flags reset.

---

### Task 1: Shared Ready And Bounty State

**Files:**
- Modify: `shared/game-state.js`
- Test: `shared/game-state.test.js`

**Interfaces:**
- Produces: `applyCommand(room, { verb: "ready", attrs: { side } }, context, options)`
- Produces: `publicState(room, side)`
- Produces: `formatBattleState(room, side)`

- [ ] **Step 1: Write failing tests**

Add tests to `shared/game-state.test.js`:

```js
test("ready requires at least three rigs for that side", () => {
  const r = createRoom("X");
  applyCommand(r, { verb: "add", attrs: { name: "A1", class: "light", owner: "a", ...W } });
  applyCommand(r, { verb: "ready", attrs: { side: "a" } });
  assert.equal(r.game.sides.find((s) => s.id === "a").ready, false);
  applyCommand(r, { verb: "add", attrs: { name: "A2", class: "light", owner: "a", ...W } });
  applyCommand(r, { verb: "add", attrs: { name: "A3", class: "light", owner: "a", ...W } });
  applyCommand(r, { verb: "ready", attrs: { side: "a" } });
  assert.equal(r.game.sides.find((s) => s.id === "a").ready, true);
});

test("both ready starts game and assigns private random bounties", () => {
  const r = createRoom("X");
  for (const owner of ["a", "b"]) {
    for (let i = 1; i <= 3; i++) {
      applyCommand(r, { verb: "add", attrs: { name: `${owner}${i}`, class: "light", owner, ...W } });
    }
  }
  applyCommand(r, { verb: "ready", attrs: { side: "a" } }, {}, { random: () => 0.99 });
  applyCommand(r, { verb: "ready", attrs: { side: "b" } }, {}, { random: () => 0 });
  assert.equal(r.game.started, true);
  assert.equal(r.game.bounties.a, findRig(r, "b3").id);
  assert.equal(r.game.bounties.b, findRig(r, "a1").id);
});

test("public state only exposes the requesting side bounty", () => {
  const r = createRoom("X");
  for (const owner of ["a", "b"]) {
    for (let i = 1; i <= 3; i++) {
      applyCommand(r, { verb: "add", attrs: { name: `${owner}${i}`, class: "light", owner, ...W } });
    }
  }
  applyCommand(r, { verb: "ready", attrs: { side: "a" } }, {}, { random: () => 0 });
  applyCommand(r, { verb: "ready", attrs: { side: "b" } }, {}, { random: () => 0 });
  assert.deepEqual(Object.keys(publicState(r, "a").game.bounties), ["a"]);
  assert.deepEqual(Object.keys(publicState(r, "b").game.bounties), ["b"]);
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- shared/game-state.test.js`

Expected: FAIL because Ready/bounty fields and commands do not exist.

- [ ] **Step 3: Implement minimal shared state**

In `shared/game-state.js`, add `ready`, `started`, `bounties`, `canReadySide`, `resetReadyBeforeStart`, `maybeStartGame`, side-aware `publicState`, and a bounty line in `formatBattleState(room, side)`.

- [ ] **Step 4: Run tests to verify pass**

Run: `npm test -- shared/game-state.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/game-state.js shared/game-state.test.js
git commit -m "Add ready bounty game state"
```

### Task 2: Side-Aware API And Prompt Privacy

**Files:**
- Modify: `server/routes/game.js`
- Modify: `server/routes/chat.js`
- Modify: `public/js/api.js`
- Modify: `public/js/chat.js`
- Test: `public/ui-static.test.js`

**Interfaces:**
- Consumes: `publicState(room, side)` and `formatBattleState(room, side)` from Task 1.
- Produces: browser polling with `GET /api/game/:room?side=a|b`.

- [ ] **Step 1: Write failing static tests**

Add assertions to `public/ui-static.test.js`:

```js
test("polling and chat send the viewer side for private state", () => {
  const api = fs.readFileSync(new URL("./js/api.js", import.meta.url), "utf8");
  const chat = fs.readFileSync(new URL("./js/chat.js", import.meta.url), "utf8");
  assert.match(api, /URLSearchParams/);
  assert.match(api, /side.*S\.session\?\.side/s);
  assert.match(chat, /side:\s*S\.session\?\.side/);
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- public/ui-static.test.js`

Expected: FAIL because polling/chat do not send side yet.

- [ ] **Step 3: Implement side-aware routes and client calls**

Pass `req.query.side` or `req.body.side` into `publicState`. Include `side: S.session?.side` in chat requests. Build polling URLs with `URLSearchParams`.

- [ ] **Step 4: Run tests to verify pass**

Run: `npm test -- public/ui-static.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/routes/game.js server/routes/chat.js public/js/api.js public/js/chat.js public/ui-static.test.js
git commit -m "Keep bounty state side private"
```

### Task 3: Ready Button And Bounty Display

**Files:**
- Modify: `public/index.html`
- Modify: `public/js/tracker.js`
- Modify: `public/css/rig-sheet.css`
- Test: `public/ui-static.test.js`

**Interfaces:**
- Consumes: `S.game.started`, `S.game.sides[].ready`, and filtered `S.game.bounties`.
- Produces: Ready button sending `sendCommand("ready", { side: S.session.side })`.

- [ ] **Step 1: Write failing UI static tests**

Add assertions to `public/ui-static.test.js`:

```js
test("rig panel exposes ready controls and private bounty display", () => {
  assert.match(html, /id="readyBattle"/);
  assert.match(html, /id="battleSetup"/);
  assert.match(tracker, /sendCommand\("ready"/);
  assert.match(tracker, /Ironclad Bounty/);
  assert.match(css, /\.battle-setup/);
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- public/ui-static.test.js`

Expected: FAIL because the Ready UI does not exist.

- [ ] **Step 3: Implement UI**

Add a `battleSetup` block near the deck controls. In `tracker.js`, render side readiness, disable Ready until the current side has three Rigs or the game has started, and show the current side's bounty target name after start.

- [ ] **Step 4: Run tests to verify pass**

Run: `npm test -- public/ui-static.test.js`

Expected: PASS.

- [ ] **Step 5: Run full verification and commit**

Run: `npm test`

Expected: PASS.

```bash
git add public/index.html public/js/tracker.js public/css/rig-sheet.css public/ui-static.test.js
git commit -m "Add ready bounty controls"
```
