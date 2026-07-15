# Wreck Screen — loud destruction + mandatory blast marking

**Date:** 2026-07-14
**Status:** Design approved, not yet planned

## Problem

A Rig dying is the loudest thing that happens on the table and the quietest thing
that happens in the app. Today destruction pushes a log line, rolls a D12, and — on
a 4+ — sets `game.pendingBlast`, which surfaces as a small "Resolve blast" CTA in
the turn banner. The CTA is missable, the drawer behind it offers a ghost "None"
button, and nothing stops play if both are ignored. Secondary blasts get skipped by
accident, and the kill itself lands with no weight.

Two changes: destruction throws a loud, blocking, full-screen card; marking the
blast radius becomes an obligation rather than a prompt.

## Decisions

| Question | Decision |
|---|---|
| Scope of "set the blast radius" | Radius stays a fixed 4". The change is that marking is mandatory and the moment is loud. No new blast mechanic. |
| Trigger | Any destruction, whatever the cause — attack, meltdown, heat, or another wreck's blast. One death, one card. |
| Audience | Both sides see the card. The victim's owner gets the "yours" framing; both cards carry the same working buttons. |
| Enforcement | Hard server-side lock. While a wreck is pending, other commands are rejected. |
| Cold deaths (D12 1-3) | Still loud. Same card, D12 result shown as the beat, single Acknowledge, no marking step. Also blocking. |
| Beats | Two. Death lands first; the blast is dealt with second. |
| Cascades | FIFO queue, resolved in death order, one card at a time. |
| Who may resolve | Any side, at any time. The obligation is that *someone* resolves it, not that a specific someone does — this is the deadlock escape. |
| Visual voice | Kill card: blackout, ash-white slab type, ember only on the D12 stamp. Deliberately unlike the ember threat alarm. |
| Audio | Reuse existing stems. No new assets. |

## Architecture

### State

`game.pendingWrecks` — a FIFO array, replacing the single `game.pendingBlast`.

```js
{ sourceId, owner, victimName, killerName, roll, exploded, acked }
```

Pushed in `onRigDamaged` (shared/game-state.js:1666) inside the existing
`_blastRolled` guard, so the queue inherits that guard's "one wreck per rig, never
re-awards" property for free.

`killerName` is threaded through `applyDamage` as `opts.killer`. It is absent for
self-inflicted deaths (meltdown charge, heat), and the card then reads
`SYSTEMS FAILURE` in place of a killer's name.

`pendingBlast` is deleted. `types.ts:159`'s `pendingBlast?: unknown` becomes a typed
`pendingWrecks: PendingWreck[]`. `battle-view.js` passes `game` through wholesale,
so the queue reaches the client with no projection work.

Cleared on round advance and reset, matching the existing `pendingBlast = null` at
shared/game-state.js:1416.

### Verbs

**`acknowledge`** (new) — sets `acked: true` on the head. If `!exploded`, the entry
shifts off immediately. If `exploded`, it stays head, now in marking mode.

**`blast`** (existing) — body unchanged (D6 + STR 10 per named target, hit location
D12, severity row). Reads `sourceId` from the head rather than `pendingBlast`, and
shifts the head on completion rather than nulling a flag. The "don't clobber a
chained blast" line at shared/game-state.js:3448 goes away: a chained death pushes
to the tail, and the tail is not the head.

Neither verb is owner-gated. `owner` is display-only.

### The lock

At the top of `applyCommand`, after `ensureGameShape`: if `pendingWrecks.length > 0`
and the verb is not in `WRECK_ALLOWED`, reject with `"Resolve the wreck first."`

```js
const WRECK_ALLOWED = new Set(["acknowledge", "blast", "undo", "reset", "seed"]);
```

`undo` stays open so a misfired attack can be walked back. `reset` and `seed` stay
open so a test room cannot brick.

### Client

**`client/src/v2/overlays/WreckOverlay.tsx`** — new, sibling of `ThreatOverlay`.
Portals to `document.body`, `role="alertdialog"`, `aria-live="assertive"`. Reads
`game.pendingWrecks[0]` — head only. Because both verbs are server-authoritative,
both devices advance together.

No dismiss button, no `✕`, no `dismissed` state. Those are the three things
`ThreatOverlay` has that this deliberately does not, and that difference is the
feature.

`acked` on the head picks the body:

- **`!acked`** — the kill card. Blackout; `DESTROYED` in ash slab type; victim name,
  weight class, and whose it is; then the D12 stamp: `D12 · 9 — MUNITIONS ERUPT` or
  `D12 · 2 — MUNITIONS COLD`. Button is `Mark the blast »` when hot, `Acknowledge`
  when cold. Both dispatch `acknowledge`.
- **`acked && exploded`** — the marking body swaps in place. Same blackout, no
  drawer. `BlastBody` moves under `WreckOverlay` and keeps its checkbox list;
  candidates are every living rig minus the wreck, as today. The two actions change:
  the ghost `None` becomes `Nobody within 4"` (same dispatch, honest label) and
  `Resolve blast` carries a live count.

**Audio** — on head arrival, `playHeatExplosion()` if `exploded`, else
`playDamage()`. Fired once per `sourceId` via a ref, the same guard `ThreatOverlay`
uses on `attackerId`, so a re-render or the acknowledge swap cannot re-bang it.

**Styling** — a new `.v2-wreck-*` block in `client/src/v2/styles/overlay.css`.
Hand-styled like the `.v2-threat-*` block and for the reason its comment already
gives: the overlay portals outside `.v2-root`, so the `--v2-*` tokens do not resolve
there. Honors `prefers-reduced-motion` by dropping the stamp's rotate-in.

**Deletions** — `resolveBlast` in `V2BattleActionsContext.tsx` and its test; the
`blast` case in `TurnBanner.tsx:29`; the `pendingBlast` branch in
`computeFocus.ts:72` and its test. The overlay replaces the banner CTA entirely.

## Flow

Hot death:

1. Rig dies. `onRigDamaged` rolls the D12, pushes `{ ..., exploded: true, acked: false }`.
2. Both sides see the kill card. Board locked.
3. Someone hits `Mark the blast »` → `acknowledge` → head gets `acked: true`.
4. Marking body swaps in. Still locked.
5. Someone marks the rigs within 4" (or confirms `Nobody within 4"`) → `blast` →
   each marked rig eats D6 + STR 10 → head shifts.
6. Queue empty → unlocked. Queue non-empty → next card, from step 2.

Cold death stops after step 3: the entry shifts on `acknowledge`.

## Edge cases

**Annihilation.** The last rig dying queues a wreck *and* ends the game. The lock
must not swallow the outcome — `outcome` is computed as today; the card sits on top,
and the victory screen lands once the queue drains.

**Revival.** A wreck entry outlives the rig's `destroyed` flag. The card renders from
the entry's own `victimName` and `roll`, never re-reading the rig, so a repair
mid-queue cannot blank it.

**Undo.** Restores `game` wholesale, so `pendingWrecks` rewinds with it — an undone
attack un-kills and un-queues in one move.

**Chains.** A blast that kills rig B pushes B's entry to the tail during the head's
own `blast` handler. Head shifts, B becomes head, B's card fires. The guarantee is
death order.

## Testing

**shared/game-state.test.js**

- Queue push on destruction, with `killerName` threaded from the attack.
- `killerName` absent on a meltdown death; card copy falls back.
- Cold roll shifts the entry on `acknowledge`.
- Hot roll stays head and enters marking mode.
- `blast` shifts the head.
- The lock rejects a normal verb with `"Resolve the wreck first."` and admits
  `undo`, `reset`, `seed`.
- Two-rig cascade: queue reads `[A, B]` in death order.
- Annihilation: `outcome` is set *and* `pendingWrecks.length === 1`.
- Round advance clears the queue.

Every roll branch is deterministic via `opts.dice.destruction` — no `random` stubs.

**client/src/v2/overlays/WreckOverlay.test.tsx**

- Renders nothing on an empty queue.
- Renders the kill card for the head.
- Shows the killer's name when present, `SYSTEMS FAILURE` when absent.
- Hot card's button dispatches `acknowledge`.
- `acked && exploded` swaps to the checkbox body without opening a drawer.
- `Nobody within 4"` dispatches `blast` with `targets: []`.
- No dismiss affordance exists (the negative assertion is the feature).
- Audio fires once per `sourceId`.

## Docs

`rules.md` §9 gains the acknowledgement beat: destruction stops the table, and
marking the blast is mandatory rather than a prompt that may be ignored.
