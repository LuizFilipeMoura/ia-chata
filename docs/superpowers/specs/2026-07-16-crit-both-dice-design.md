# F3-E — mark every decisive die CRIT, not just the last

**Date:** 2026-07-16
**Status:** proposed, not implemented.
**Parent:** `2026-07-16-post-rework-cleanup-design.md` §F3-E (this closes that item).
**Decision taken:** Option 2 — promote every decisive die (user's call, 2026-07-16).

---

## The defect

`resolveAttack` in `shared/combat.js` promotes a wound die to `tone: "crit"` on two tiers:

- **torn open** — a wound zeroes a location from full (`wasFull && after === 0`, ~line 823)
- **gutted** — a point spent past 0 kills the unit (`wasAlive && target.destroyed`, ~line 817)

Both tiers write the same `let critWound` (~line 730), and a single read after the damage loop
(~line 844) promotes exactly that one die. It is **last-write-wins**: when one volley does both,
the kill die overwrites the tear-open die, and the tear-open die renders `tone: "ok"` — no CRIT —
even though its own `effects` line (`… torn open in one blow`, pushed at ~line 824) still narrates
that it tore the location open.

**The mismatch:** both `drama.push` lines fire, so `effects` narrates two decisive events, while
the dice highlight only one. The roll console exists precisely so the player sees *which* die did
the decisive thing (see the `verdictLabel` comment in `RollConsole.tsx` and the `woundRolls`
comment at ~line 754 of `combat.js`). Here two dice each did something `effects` names, and one is
left silent.

**Reachability (verified against code at HEAD, re-measure before acting):** a stock catalog
loadout, zero fixture pokes. Claw (ROF 2, Damage 3) + `rending-talons` (grants Rend → `sp = 4`)
against an untouched light rig engine (`max 4`). Wound 1 zeroes the engine from full → tear-open,
`critWound = h1`. Wound 2 spends 4 past 0 → kill, `critWound = h2`, `continue`. Final read promotes
h2 only; h1's die stays `"ok"`.

**Bounded, no runaway:** all impacts in a volley hit the same `location`, so once torn open
`wasFull` is false and once destroyed `wasAlive` is false. At most one tear-open + one kill =
**≤ 2 CRIT dice per volley**. A single wound that both zeroes-from-full and kills enters the kill
branch, which `continue`s past the tear-open branch (~line 821) — so one wound is counted once.

## The change

`shared/combat.js`, `resolveAttack`:

1. `let critWound = null` (~line 730) → `const critWounds = []`.
2. Kill branch (~line 820): `critWounds.push(h)` in place of the assignment; keep the `continue`.
3. Tear-open branch (~line 825): `critWounds.push(h)` in place of the assignment.
4. Promotion after the loop (~line 844):
   `for (const h of critWounds) woundRolls[impacts.indexOf(h)].tone = "crit";`

No dedup guard is needed: the kill branch's `continue` means a single wound never reaches both
push sites, and distinct wounds are distinct `h`. The list holds at most two entries.

## Comments must be rewritten, not left

The block comment at ~lines 725-728 and ~835-843 currently **argues for single-promotion**
("`critWound` is last-write-wins, so one read here promotes exactly one die, where promoting at
each assignment would leave TWO dice reading CRIT"). That reasoning is exactly what we are
reversing — leaving it makes the comment a false claim describing the opposite of the code.

Rewrite both to state the new rule: a die that tears a location open **and** a die that kills the
unit each earn CRIT; the collection exists so a volley that does both promotes both, matching the
two `effects` lines. The "outside the loop" reason still holds (the kill branch `continue`s past
the tear-open assignment, and the wound rolls were pushed before `applyDamage` ran) and stays.

*Discipline (from the parent's one rule): the comment is a claim. Verify the artifact it
describes — run the two-tier volley and read the tones — before trusting the sentence.*

## Client — no change

`client/src/v2/overlays/RollConsole.tsx` keys CRIT per-die: `verdictLabel` returns `"CRIT!"` for
any wound die with `tone === "crit"` (~line 46), and each die renders its own verdict (~line 409).
Two dice with `tone: "crit"` each render "CRIT!" with no code change. (The legacy
`client/src/components/overlays/RollConsole.tsx` shares the same per-die shape; unaffected either
way since the branch runs V2.)

## Test

Belongs in `shared/game-state.test.js` driving `applyCommand`, **not** `combat.test.js` — that
file's `makeCtx` either stubs `applyDamage` as a no-op or as a plain SP-subtract that never sets
`target.destroyed`, so neither can exercise the kill tier. The real `applyDamage` from
`game-state.js` (destroy + catastrophic logic) is required to reach both tiers in one volley.

Two cases, both with fixed dice:

1. **Two-wound volley, tear-open then kill** — wound 1 zeroes a location from full, wound 2 kills.
   Assert **both** wound dice settle `tone: "crit"`.
2. **Single wound that both zeroes-from-full and kills** — assert **exactly one** CRIT die (guards
   the `continue` path and confirms no double-count).

New assertions only; no existing test changes. Verify every expected number by execution, never by
copying what the code prints.

## Out of scope

- Every other item in the parent backlog (F3-A, F3-B, F3-D, F3-F, F3-G, F3-H).
- Changing *when* a die is decisive — the tiers stay tear-open + kill. This only stops the
  last-write-wins loss between them.
- Any CRIT behaviour for to-hit dice (d6 6s) — unchanged.
