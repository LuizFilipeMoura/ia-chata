# Aimed Attack (melee-capable) — Design

**Date:** 2026-07-19
**Status:** approved, pre-implementation

## Problem

The Aimed action lets a Rig **choose the hit location** instead of rolling
for it, at −2 ACC. Today it is **ranged-only**: two surfaces hard-disable it the
moment the ranged weapon is spent or a melee weapon is selected. A Rig that has
fired its gun and is locked in melee cannot aim a sword-blow at, say, an already-
crippled leg — even though picking a location by hand is *more* plausible up
close than at range. This design lifts that restriction and renames the action
so its name stops implying "ranged".

## Decision

**Aimed Shot → Aimed Attack.** Same action, same cost (1 slot, 1 heat, −2 ACC,
1-action). It now works with a **melee** weapon as well as a ranged one.
Ranged-vs-melee no longer gates availability. The internal action key stays
`aimed` (no data migration).

Chosen over a separate melee-only "Aimed Strike" action (rejected: doubles the
action catalogue for no mechanical difference) and over a weapon-adaptive label
(rejected: the action-console tile renders before a weapon is picked, so it has
nothing to key the label off — see AttackWizard note below).

## Why this is safe (interaction audit)

The engine already routes the location pick off `opts.aimed` with **no ranged
guard** ([shared/combat.js:547](../../../shared/combat.js)), so the resolution
core needs zero change. Every reaction/perk that could interact was checked:

- **Brace / Riposte counters** trigger on "a melee attack". An aimed melee swing
  *is* a melee attack, so they fire exactly as they do for an un-aimed swing —
  no special case, no double-trigger.
- **Enfilade** (every-3rd-aimed ricochet) keys on `opts.aimed` **but is gated by
  `profile.upgradeEffect?.enfilade`** ([shared/combat.js:691](../../../shared/combat.js)),
  where `profile` is the *firing weapon's* profile. Enfilade lives on the
  Sniper Cannon (a ranged slot); a melee weapon never carries it, so an aimed
  melee attack cannot advance or trigger the ricochet cadence.
- **Precision** perk still waives the −2 ([shared/combat.js:45](../../../shared/combat.js));
  unchanged, applies to melee aimed too.
- **Engaged −2 ranged penalty** does not touch melee, so an aimed *melee* attack
  while engaged eats only the −2 aim from the Aimed action itself — as intended.

## Changes

### 1. Rename (cosmetic; key `aimed` unchanged)

- `ACTIONS.aimed.label`: `"Aimed Shot"` → `"Aimed Attack"`
  ([shared/rules.js:14](../../../shared/rules.js)).
- **rules.md** §5 action entry — retitle **Aimed Shot** → **Aimed Attack** and
  reword so it reads "a Fire Weapon action … with **any** weapon"; drop the word
  "Shot".
- **rules.md** §6 heat table row `Aimed Shot / Prepare` → `Aimed Attack / Prepare`.
- **rules.md** §5 Exploit Opening counter: "free **Aimed** counter-shot" →
  "free **Aimed** counter-attack" ([rules.md:183](../../../rules.md)); §13
  Precision "may make an Aimed Shot" → "an Aimed Attack" ([rules.md:499](../../../rules.md)).
- **glossary** entry `aimed-shot`: `term` → `"Aimed Attack"`, `match` →
  `["Aimed Attack"]`, and reword the def to say "with any weapon"
  ([shared/glossary.js:105](../../../shared/glossary.js)). Keep the `id`
  `"aimed-shot"` (stable anchor).

### 2. Enablement — the behavior change

- **[shared/battle-view.js:42-51](../../../shared/battle-view.js)** — remove the
  `if (key === "aimed") enabled = false` branch that shuts Aimed when the ranged
  weapon is spent. Replace the ranged-only assumption with a gate that keeps
  Aimed live as long as **any** weapon can strike: enabled when the ranged
  weapon is loaded **or** the Rig has a live (non-destroyed) melee weapon. A Rig
  with neither has no attack and Aimed stays disabled, same as Fire.
  - The existing "Second shot — +1 heat" surcharge note and the "Engaged −2 Aim"
    note ([battle-view.js:61](../../../shared/battle-view.js)) are ranged-shot
    concerns; leave them keyed on the ranged path so they don't show on a pure
    melee aim.

- **[client/src/v2/overlays/AttackWizard.tsx:339-340](../../../client/src/v2/overlays/AttackWizard.tsx)** —
  remove `if (isMelee && aimed) setAimed(false)`. The Aimed toggle now persists
  when a melee weapon is selected; the drawer keeps rendering the location
  picker and submits `loc` (the submit path at
  [AttackWizard.tsx:422](../../../client/src/v2/overlays/AttackWizard.tsx)
  already attaches `attrs.loc = state.loc` whenever `aimed`, with no melee
  guard — no change there).

No new UI: the location picker already appears whenever `aimed` is on.

## Testing (no value-pinning — see memory)

- **[shared/battle-view.test.js:47-48](../../../shared/battle-view.test.js)** and
  **[:265](../../../shared/battle-view.test.js)** currently assert Aimed is
  disabled / "ranged-only". Update to the new rule:
  - Aimed **enabled** when the rig has a live melee weapon even with the ranged
    weapon **spent**.
  - Aimed **disabled** only when no weapon can strike (ranged spent *and* no
    live melee), matching Fire.
- New engine assertion: an aimed **melee** attack routes the hit to the chosen
  `aimedLoc` (structural — assert the location, not the SP number). The existing
  aimed-routing coverage in [shared/combat.test.js](../../../shared/combat.test.js)
  is the template; add a melee-weapon variant.
- Label assertion: the action surfaces as `"Aimed Attack"`. Update the existing
  `ACTIONS.aimed` label test if it pins the string.
- Glossary: term/match now `"Aimed Attack"`.

Assert **structure and enablement only** — never specific ACC/damage/location
numbers (per the No-value-pinning-tests rule).

## Out of scope

- No heat / slot / ACC retuning — the melee aim carries the identical −2 as the
  ranged aim.
- No new action, no data migration (key stays `aimed`).
- Precision behaviour unchanged.
