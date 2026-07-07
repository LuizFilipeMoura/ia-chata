# Test Harness (`/test`) — Design

**Date:** 2026-07-07
**Status:** Approved design, pre-implementation

## Goal

A dev-only `/test` screen to exercise the full battle flow solo: control **both** sides at once (split view), auto-seed a full match, and randomize any rig's loadout on demand. Lets one person walk every phase (setup → initiative → activation → recovery → finished) and every action without a second browser or a real opponent.

## Context (current code)

- **No router.** `client/src/App.tsx:39-40` conditionally renders `<JoinGate>` vs `<Terminal>` based on `session.room`.
- **Networked, side-scoped, but server trusts `side` blindly.** Commands POST `/api/game/:room/command` with body `{cmd:{verb,attrs}, side}` (`client/src/hooks/useCommands.ts:12-16`). Server never verifies the caller owns that side, so one client can already act as both.
- **`mySide` is scattered.** ~8 components each read `session?.side || "a"` independently (BattleHud, RigDeck, TurnBanner, BattleSetup, BattleActionsContext, etc.). No single source.
- **All battle logic in `shared/game-state.js`** `applyCommand` reducer (server-authoritative, client re-runs optimistically). Debug verbs already exist and are turn/owner-ungated: `add`, `remove`, `reset`, `damage`, `repair`, `set`, `heat`, `ready`.
- **Rig build:** `makeRig(id, name, cls, owner, weapons, equipment)` (`shared/game-state.js:343`). Full capacity = `class:"medium"` + one `longRange` weapon + one `melee` weapon + an upgrade for each + one `equipment`. Weapon/upgrade/equipment catalogs: `WEAPONS`, `WEAPON_UPGRADES`, `EQUIPMENT` in same file.
- **RNG** threads through the reducer as `options.random`.

## Decisions (locked)

1. **Side control:** Split view — both sides' consoles visible at once.
2. **Randomize:** New `randomize` debug verb in the shared reducer (server-authoritative), not client remove+re-add.
3. **Bootstrap:** Auto-seed a full match on load.
4. **Seeded loadouts:** Random per rig (same reroll logic as the button).

## Design

### 1. Entry — `App.tsx` path check

Add near the top of `App`:

```
if (import.meta.env.DEV && window.location.pathname === "/test") return <TestHarness />;
```

- Dev-only: in a production build `import.meta.env.DEV` is `false`, so `/test` falls through to the normal join flow. No prod exposure.
- No router dependency added.

### 2. Split view + side override

**Problem:** two side-by-side battle views must disagree on "who am I", but `mySide` is read from a single `session.side` in ~8 places.

**Fix (clean refactor):**
- New `ViewSideContext` (React context, default `undefined`).
- New hook `useMySide()`: returns the `ViewSideContext` override if present, else `session?.side || "a"`.
- Replace the ~8 `session?.side || "a"` reads with `useMySide()`. Behavior is identical in the normal app (no provider → falls back to session).

**`TestHarness` component:**
- Owns one shared room state + socket (same providers as normal app — one real room, both sides live in it).
- On mount, ensures a session/room exists (seed step below).
- Renders: `<DevToolbar/>` on top, then two columns. Each column = `<ViewSideContext value="a"|"b"><Stage/></ViewSideContext>`. Left = side A's perspective, right = side B's. Command posts from each column stamp that column's side (thread the override into `useCommands` too — see below).

**`useCommands` side source:** currently stamps `session.side`. Change it to `useMySide()` so a column posts as its own side. Normal app unaffected (no override → session.side).

### 3. Auto-seed + full-capacity rig

- Raw helper `postCmd(room, side, verb, attrs)` — a bare `fetch` to `/api/game/:room/command` with an **explicit** `side` (bypasses session), so the harness can drive both sides during setup.
- Seed script on mount (idempotent — skip if room already seeded):
  1. Pick/generate a fixed test room id (e.g. `"test"`), join as side A and side B via `/join`.
  2. For each side, `add` 3 rigs with a **random full loadout** each (client picks class `"medium"` + random weapons/upgrades/equipment, passes them as `add` attrs).
  3. `lock` the field (whatever verb locks it — confirm during impl).
  4. `ready` both sides → `maybeStartGame` fires → lands in `activation`.
- Loadout picker lives client-side in a shared helper (`randomLoadout()`) reused by both seeding and the reroll button's attrs. The actual reroll of an existing rig, though, is server-side (verb below) so state stays authoritative.

### 4. `randomize` verb (`shared/game-state.js`)

Add a branch in `applyCommand`, alongside the other name-keyed debug verbs (`damage`/`repair`/`set`/`heat`):

```
else if (verb === "randomize") {
  // rebuild rig in place with a random full loadout, preserve id/name/class/owner/placement
  const fresh = makeRig(rig.id, rig.name, rig.weightClass, rig.owner, randomRigWeapons(options.random), randomEquipment(options.random));
  if (fresh) { replace rig in room.rigs (keep array index); changed = true; }
}
```

- Only meaningful for `kind:"rig"` (cold kinds ignored/no-op).
- Uses `options.random` for reproducibility.
- New pure helpers in the shared module: `randomRigWeapons(rng)` (random longRange+melee keys + an upgrade id for each) and `randomEquipment(rng)` (random `EQUIPMENT` key). Both drawn from the existing catalogs.
- Rebuild via `makeRig` resets SP to max — acceptable for a test tool (fresh rig each reroll). Field placement is keyed by rig id, which is preserved, so placement survives.

### 5. `DevToolbar`

Buttons (each = one or more `postCmd` calls, explicit side):
- **Reroll all** — `randomize` every rig.
- **Add rig** (per side) — `add` a random full rig (respects `MAX_RIGS_PER_SIDE`; button disables at cap).
- **Force phase** — jump to initiative / activation / recovery (via existing verbs; confirm exact verbs during impl).
- **Switch turn side** — flip `turn.side` (handoff/existing verb).
- **Hard reset** — `reset` verb.
- **Re-seed** — tear down + rerun seed script.

### 6. Safety

- Dev-only mount gate (§1).
- Reuses existing ungated debug verbs; the new `randomize` verb is same risk class (already ungated debug family).
- No auth work — server already trusts `side`; out of scope for this tool.

## Files touched

| File | Change |
|------|--------|
| `client/src/App.tsx` | dev-only `/test` path check |
| `client/src/components/test/TestHarness.tsx` | **new** — split view + seed + providers |
| `client/src/components/test/DevToolbar.tsx` | **new** — control buttons |
| `client/src/state/ViewSideContext.tsx` | **new** — side override context |
| `client/src/hooks/useMySide.ts` | **new** — override-or-session hook |
| ~8 components (BattleHud, RigDeck, TurnBanner, BattleSetup, BattleActionsContext, …) | swap `session?.side\|\|"a"` → `useMySide()` |
| `client/src/hooks/useCommands.ts` | stamp `useMySide()` instead of `session.side` |
| `client/src/lib/loadout.ts` (or new) | `randomLoadout()` client helper for seeding attrs |
| `shared/game-state.js` | `randomize` verb + `randomRigWeapons`/`randomEquipment` helpers |

## Out of scope

- Auth / ownership enforcement on the server.
- Persisting harness state across reloads (seed is idempotent, that's enough).
- Testing cold kinds (tank/walker) loadouts — rigs only for now.
