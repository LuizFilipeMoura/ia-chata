# V2 Test Seed + Enemy Impersonation — Design

**Date:** 2026-07-11
**Status:** Approved, ready for planning

## Purpose

Make v2 battles trivially testable — by hand and by agents. One action produces a
valid, already-started 3v3 room; a second affordance lets the seeding operator act
on the enemy's turn. Reachable three ways from one source of truth: shared unit
tests, an HTTP call, and a UI button.

## Background (current model)

- A **room** is server-authoritative with two sides `a`/`b` (`shared/game-state.js`).
- Rigs are added with the `add` command; `applyCommand` respects `attrs.owner`, so
  **one client can populate both sides**.
- A battle auto-starts (`maybeStartGame`) when: field locked **and** both sides
  `ready` **and** each side has ≥3 rigs. Turn order derives from the order sides
  readied (`deploymentOrder`), with an initiative roll on start.
- Commands hit `POST /api/game/:room/command` with `{ cmd:{verb,attrs}, side }`.
  The server does **not** authenticate `side` — `context.side` is taken verbatim
  from the body. Turn-gated verbs (`activate`, `action`, `react`, `answer`) gate on
  `rig.owner === turn.side`, **not** on who claimed the side.
- Client view + command routing both flow through `useMySide()`, which already
  honors a `ViewSideContext` override (today used only by the `/test` split view).
- `publicState(room, side)` redaction is minimal: it only hides enemy **face-down
  preparations** and the enemy **bounty**. Everything else is already visible.

These existing seams make both features small.

## Non-goals

- No auth/authorization model. Seed rooms are test artifacts; impersonation is a
  deliberate test capability, not a security boundary.
- No new heavy chassis, no roster editor UI. Fixed roster + optional param only.
- No change to the normal (non-seeded) join/commission/ready flow.

---

## Feature 1 — `seed` command verb

New verb in `applyCommand` (`shared/game-state.js`). Single source of truth reused
by HTTP, the client helper, and shared tests.

```
applyCommand(room, { verb: "seed", attrs: { first, seed?, roster? } }, context)
```

**Attrs**

| attr     | type              | default        | meaning                                     |
|----------|-------------------|----------------|---------------------------------------------|
| `first`  | `"a" \| "b"`      | `"a"`          | side whose turn it is when the battle opens |
| `seed`   | `number`          | *(unused v1)*  | reserved for a future random-valid roster   |
| `roster` | array (see below) | fixed default  | optional override of the 6 rigs             |

**Behavior (idempotent — safe to call on an existing room):**

1. Clear game + units: `room.rigs = []`, reset `nextRigId`, reset game shape
   (reuse existing reset paths; do not hand-roll).
2. Add the 6 rigs (below), 3 per side, via the same code path `add` uses
   (`makeUnit`), stamping canonical chassis weapons/class/sp.
3. Lock the field at default dims (reuse the `field` `lock` path).
4. Force-start deterministically: set `started`, `phase:"activation"`, `round:1`,
   bounties, answer tokens, and `turn.side = first`, via a helper
   `startGameSeeded(room, first)` that calls `applyInitiative` with an **explicit**
   order `[first, other]` — **no dice roll**, so tests can assert the exact turn.
5. Set `room.seeded = true`.

**Fixed default roster (all 6 chassis distinct; 3 medium / 3 light — no heavy
class exists in the catalogue, which is 7 light + 3 medium):**

| name | owner | chassis                  |
|------|-------|--------------------------|
| `A1` | a     | `medium-lance-mortar`    |
| `A2` | a     | `light-claw-autocannon`  |
| `A3` | a     | `light-sword-arc`        |
| `B1` | b     | `medium-shield-siege`    |
| `B2` | b     | `medium-sniper-chainsaw` |
| `B3` | b     | `light-harpoon-anchor`   |

Roster entries resolve through the existing chassis catalogue, so the result is a
legal loadout regardless of the `enforceChassis` guard (which only guards `add`,
not `seed`).

**Guard note:** `enforceChassis` in `server/routes/game.js` intercepts only
`verb === "add"`. `seed` passes through untouched — intended.

## Feature 2 — `publicState` exposes `seeded`, drops redaction in seed rooms

- Add `seeded: room.seeded ?? false` to the `publicState` return.
- When `room.seeded` is true, skip the face-down-preparation and bounty redaction
  so an impersonator has full visibility of both sides.
- Client `ServerState` type gains `seeded?: boolean`; reducer passes it through.

## Feature 3 — Client seed helper

`client/src/v2/hooks/useSeedBattle.ts`

```ts
export function useSeedBattle() {
  const send = useCommands();
  return useCallback(
    (first: "a" | "b") => send("seed", { first }),
    [send],
  );
}
```

Callable from component tests without a browser (mock `useCommands`, assert it
sends `("seed", { first })`).

## Feature 4 — Join UI: "Seed Test Battle"

On the `Join` screen (`client/src/v2/screens/Join.tsx`), a secondary CTA below the
existing "Enter The Yard" button: **"Seed Test Battle ▸"**.

Flow:

1. Click → a small inline wizard (two buttons) replaces/overlays the card body:
   **"Your turn"** and **"Enemies turn"**.
2. Pick:
   - *Your turn* → you join as `a`, `first = "a"`.
   - *Enemies turn* → you join as `a`, `first = "b"`.
3. Autogenerate a room code `SEED-XXXX` (4 chars, `A–Z0–9`; RNG lives in the
   component, not in shared code).
4. Join that room (existing `onJoin` path → claims side `a`), then send
   `seed { first }`.
5. Land in `V2Terminal` with a live 3v3, correct opening turn.

Wiring: `Join` gains an optional `onSeed(first)` prop; `V2App` implements it
(join, then `seed`). Keeps `Join` presentational.

## Feature 5 — Enemy impersonation

Reuse the existing `ViewSideContext`/`useMySide` cascade; make the override
runtime-switchable inside the terminal.

- Introduce impersonation state at the terminal root (`V2Terminal` or a tiny
  dedicated provider): `actingSide: string | undefined`, default `undefined`
  (= your real session side).
- Wrap the terminal subtree in `<ViewSideContext.Provider value={actingSide}>`.
  Because `useMySide` already reads this context and the whole app routes view +
  command `side` through `useMySide`, flipping it flips everything — rig
  ownership, which wizards open, and the `side` sent on every command.
- Render an **"Acting as: [A] [B]"** chip **only when `state.seeded`**. Toggling
  sets `actingSide`. To act on the enemy's turn: switch to that side, then act.
- **HTTP impersonation needs no new code** — `POST /command { cmd, side:"b" }`
  already acts as B. The only enabling change is Feature 2 (full visibility in
  seeded rooms), already covered.

The chip is hidden in normal rooms, so production play is unaffected.

---

## Data flow

```
Seed (UI):   Join → onSeed(first) → onJoin(SEED-XXXX,a) → useCommands.send("seed",{first})
Seed (HTTP): POST /api/game/SEED-XXXX/join {side:"a"}
             POST /api/game/SEED-XXXX/command {cmd:{verb:"seed",attrs:{first}}, side:"a"}
Seed (test): applyCommand(room, {verb:"seed",attrs:{first}}) → assert started 3v3
Server:      applyCommand seed → persist → hub.broadcast → publicState(seeded:true)
Impersonate: ViewSideContext=actingSide → useMySide → command side + view perspective
             (HTTP: pass side:"b" in the command body directly)
```

## Error handling

- `seed` with unknown `first` → default `"a"` (via `normalizeSide` fallback).
- `seed` on a room mid-battle → full reset then re-seed (idempotent).
- Roster override with an unresolvable chassis → skip that entry; if the result
  has <3 rigs per side, the force-start guard leaves the game un-started (same as
  today's ≥3 rule) rather than producing an invalid battle.
- Autogenerated code collision (already-existing room) → `getOrCreateRoom` reuses
  it; `seed` resets it. Acceptable for test rooms.

## Testing

**Shared (`shared/game-state.test.js`)**
- `seed` produces a started game: `phase:"activation"`, `round:1`, `started:true`,
  `seeded:true`.
- Exactly 3 rigs per side; all 6 chassis ids distinct.
- `turn.side === first` for both `first:"a"` and `first:"b"` (deterministic, no
  dice dependence).
- Re-seeding an existing room yields the same shape (idempotent).
- `publicState` returns `seeded:true` and does **not** redact enemy face-down prep
  when seeded.

**Client**
- `useSeedBattle` sends `("seed",{first})` (mock `useCommands`).
- Join wizard: clicking "Your turn"/"Enemies turn" calls `onSeed` with the right
  `first` and triggers a join with a `SEED-` code.
- Impersonation chip: visible only when `seeded`; toggling to `b` makes a
  subsequent command carry `side:"b"` (assert via the `useMySide` cascade / a
  mocked command send).

## Files touched

- `shared/game-state.js` — `seed` verb, `startGameSeeded` helper, `seeded` flag,
  `publicState` changes.
- `shared/game-state.test.js` — seed + publicState tests.
- `client/src/state/types.ts` (or wherever `ServerState` lives) — `seeded?` field.
- `client/src/v2/hooks/useSeedBattle.ts` (+ test).
- `client/src/v2/screens/Join.tsx` — seed CTA + mini wizard (+ test update).
- `client/src/v2/V2App.tsx` — `onSeed` handler (join + seed).
- `client/src/v2/V2Terminal.tsx` — `ViewSideContext.Provider` + impersonation chip
  (new small component, e.g. `ImpersonateChip.tsx`) (+ test).

No changes to `server/routes/game.js` (the generic `/command` route already
carries `seed` and body `side`).
