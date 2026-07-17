# Restore high Penetration — waste it, don't convert it to Damage

**Date:** 2026-07-16
**Status:** proposed, not implemented.
**Reverses:** the value changes of `2026-07-16-penetration-rework-design.md` (SHIPPED). This is a
deliberate re-opening of that rework, at the user's direction — the backlog's "do not re-litigate"
note is overridden here.

---

## The decision

The penetration rework compressed rig-weapon Penetration into a 3–7 band and **paid the wasted
Penetration back into Damage** (Siege Maul 11/5 → 7/6, etc.). The user rejects that trade: **excess
Penetration should simply be wasted** — a gun with Pen above the wound-floor gets nothing for it, and
that is fine. It should NOT be refunded as alpha.

So: restore the affected rig weapons to their **pre-rework Penetration and Damage**. High Pen returns
and is harmlessly wasted above each location's saturation point; Damage returns to its lower
pre-rework value (no refund). Net vs post-rework: more reliable, lower alpha — the opposite of the
trade the rework made.

**Overmatch is already gone** (deleted from the runtime 2026-07-16). It was the only *mechanic* that
converted Penetration overflow into Damage; nothing needs removing there. The rework's "pay it into
Damage" was a one-time re-tuning of static catalog numbers, so undoing it is a value edit, not a
mechanic change.

**Scope: rig weapons only.** Not the field upgrades (a separate axis — deferred), not `UNIT_WEAPONS`
(tanks/walkers — explicitly out), not armour/SP catalog values, not the wound-roll clamp or the
deletion of Heavy/Colossal (both stay).

## 1. Catalog — `shared/game-state.js` `WEAPONS`

Restore exactly these (values pulled from git `9bab818^`, the commit before the compression; verify
against git before editing — do not hand-trust this table):

| weapon | current (Pen/Dmg) | restore to |
|---|---|---|
| Sniper Cannon | 6 / 8 | **10 / 4** |
| Siege Maul | 7 / 6 | **11 / 5** |
| Harpoon | 7 / 6 | **10 / 3** |
| Wrecking Ball | 6 / 7 | **10 / 5** |
| Anchor | 7 / 6 | **10 / 4** |
| Lance | 6 / 7 | **9 / 4** |
| Arc Gun | 7 / 3 | **8 / 3** |
| Crossbow | 7 / 4 | **8 / 4** |
| Autocannon | 6 / 2 | **7 / 2** |
| Talon | 5 / 3 | **6 / 3** |

Only `pen` (all ten) and `dmg` (the six heavies) change. ROF, Accuracy, ranges, sweet-spot, perks,
`flatPick` — untouched. No other weapon in the catalog was touched by the rework (confirmed by a full
`9bab818^`-vs-HEAD diff of the `pen:`/`dmg:` lines).

## 2. Remove the value-diff guards — `shared/rulebook.test.js`

These tests diff `rules.md`'s printed weapon numbers against the catalog. They red the moment a value
changes and re-red on every future tune — exactly the maintenance the user is eliminating
(see memory `no-value-pinning-tests`). Remove:

- **§12's Sniper Cannon weight-ladder prose guard** (`rulebook.test.js:116`) — pins a specific Pen in prose.
- **§12 long-range stat-table guard** (`:132`) — diffs rof/pen/dmg/sweet/peak/dropoff/range per weapon.
- **§12 melee stat-table guard** (`:150`) — same for melee.
- **§13 upgrade-parenthetical guard** (`:190`) — diffs `+N Penetration`/`+N Damage` etc. against `WEAPON_UPGRADES`.

Removing `:190` also drops its non-numeric perk/rof/range coverage; accepted as part of retiring the
value guard. Leave any rulebook guard that does NOT pin a tunable value (structural/heading checks,
glossary term presence) intact — audit the file and remove only the four value-diff tests above plus
any that fail solely because their pinned number was stripped from `rules.md` in §3.

## 3. Strip tunable stat VALUES from `rules.md`

`rules.md` is baked verbatim into the rules bot's prompt as its source of truth. With no guard and
constant tuning, any printed number will drift and the bot will serve stale stats. So remove the
per-unit tunable numbers the user iterates on, keeping every weapon/section's **name, structure, and
mechanics**:

- **§12 Weapon Profiles** — remove the **Penetration** and **Damage** columns from the weapon tables
  (keep ROF, Accuracy, RNG, sweet-spot, range, perks). Remove the §12 Sniper Cannon weight-ladder
  worked example (it quotes specific Pen numbers). Keep the weight-class modifier *rule* (Light −1 /
  Medium +0) — it is a mechanic, not a per-weapon stat.
- **§2 Rig Statistics** — remove the SP table's per-component numbers and the specific Toughness
  example figures (the "Hull T5 / Engine T3" instances); keep the prose that SP and Toughness exist
  and vary by location.
- **§17 Unit Weapons** — remove its Pen/Damage numbers (the table is already known-stale; this
  supersedes it rather than repairing it).
- **§13 Upgrades** — strip the numeric part of any Penetration/Damage parenthetical (`+2 Penetration`
  → `grants Penetration`, or drop the figure); keep the upgrade name and what it does qualitatively.

**Decision to confirm at spec review (narrow reading chosen):** this strips the *catalog/chassis stat
tables* the user tunes, but KEEPS rules-mechanic constants that merely mention the words — §5's melee
counter Penetration, §7's arc bonuses (+2 side / +3 rear) and the 10%-per-point rule, §9's destruction
blast (Pen 8 / D2), §8's catastrophic table. These are game rules, not tunable unit stats; removing
them would gut the rules explanation. If the user wants those stripped too, widen §3 here.

## 4. Fix value-fragile mechanic tests — synthetic inputs, not new assertions

Changing the ten weapons may red a handful of *mechanic* tests that read one of these weapons from the
catalog and assert a Pen-derived outcome (a `computePen`/`woundTarget`/damage result). The fix is to
make each such test **value-immune**: feed it a synthetic profile with a fixed inline Pen/Damage
instead of reading the catalog, so the mechanic stays covered and future tuning never reds it. Do NOT
re-pin the new value.

Known-safe: the arc/aim tests that use these weapons (`combat.test.js` ~30–140) assert Accuracy, not
Pen — unaffected. The no-dead-zone / raw-TN-in-band invariant tests (`combat.test.js:2200–2249`) stay
green: they guard the *weak* end (worst raw TN is the unchanged Rivet Gun at 9); raising strong
weapons' Pen only lowers their raw TN, adding no hopeless matchup and leaning on no clamp rail.

Method: apply §1, run the full suite, and for each red that is a mechanic test on a changed weapon,
convert its input to a synthetic fixed profile. Anything that is purely a removed value-guard is
deleted in §2, not "fixed."

## 5. No new value tests

Per memory `no-value-pinning-tests`: add no test asserting a specific Pen/Damage/armour number. Test
mechanics and invariants only.

## Out of scope

- Field upgrades that stopped selling Penetration (honed-talons, depleted-core, reinforced-head,
  haymaker, fluked-head) — a separate axis; deferred.
- `UNIT_WEAPONS` (Tank Cannon etc.) — tanks/walkers, explicitly dropped.
- Armour/SP catalog values (the Zebra engine-8 tuning and the §8 vital floors) — untouched.
- Re-adding Overmatch or any Pen→Damage mechanic — the whole point is that excess Pen is wasted.
- The wound-roll clamp and the Heavy/Colossal deletion — both stay.

## Verification

- `npm test` green after §1–§4.
- Grep `rules.md` for stray weapon Pen/Damage numbers after §3 — none of the ten weapons' stats
  should print a Penetration or Damage figure.
- Sanity-drive one restored weapon in-app (e.g. a Siege Maul volley) and confirm the ledger shows the
  high Pen saturating (wound TN flooring at 2) with the lower Damage per wound.
