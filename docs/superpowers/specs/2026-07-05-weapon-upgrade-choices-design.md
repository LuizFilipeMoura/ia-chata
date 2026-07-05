# Weapon Upgrade Choices Design

## Goal

Weapon upgrades are no longer fixed read-only tags. Each equipped weapon presents exactly two upgrade choices, and the player chooses one upgrade for that weapon when commissioning a Rig. The chosen upgrade is stored on the Rig and changes how that weapon behaves in combat.

This replaces the current fixed-upgrades model documented in `shared/game-state.js`, `public/js/rig-wizard.js`, `public/js/tracker.js`, and `rules.md`.

## Player Model

Every Rig still equips one Long Range weapon and one Melee weapon. During commission:

1. Pick identity, weight class, side.
2. Pick Long Range weapon.
3. Pick one of that weapon's two upgrades.
4. Pick Melee weapon.
5. Pick one of that weapon's two upgrades.
6. Pick one equipment item.
7. Confirm.

Changing a weapon resets that weapon's selected upgrade to the first valid option for the new weapon. A Rig cannot be created with a missing or invalid upgrade choice.

## Data Model

Keep `WEAPON_UPGRADES` keyed by canonical weapon name, with exactly two entries per weapon. Each entry gains a stable `id` and machine-readable `effect` object while keeping `name` and `tag` for UI/rules text.

Example shape:

```js
{
  id: "extended-belt",
  name: "Extended Belt",
  tag: "+2 ROF; dice showing 1 add heat",
  effect: { kind: "rof", amount: 2, heatOnOnes: true }
}
```

Each Rig stores chosen upgrades under a separate `weaponUpgrades` field:

```js
weaponUpgrades: {
  longRange: "extended-belt",
  melee: "duelist-balance"
}
```

This keeps base weapon identity (`rig.weapons`) separate from customization (`rig.weaponUpgrades`), which makes legacy rooms easy to backfill.

## Backfill and Validation

`makeRig` validates the selected upgrade for each chosen weapon. If no upgrade is supplied, it defaults to the first upgrade for that weapon so existing add commands and legacy tests remain valid.

`ensureRigShape` backfills missing or invalid `weaponUpgrades` for legacy Rig objects using the currently equipped weapon names. If a weapon is missing, the corresponding upgrade remains `null`.

## Combat Behavior

Combat resolves against an effective profile derived from the base weapon plus the selected upgrade. Existing rules such as destroyed weapons, reload state, Hot, Full Auto, Charged Shot, Raking Fire, and base perks still work.

The first implementation wires each current upgrade to a concrete effect:

| Weapon | Upgrade | Combat effect |
|---|---|---|
| Mini Gun | Extended Belt | +2 ROF; attack dice showing 1 add 1 heat |
| Mini Gun | Suppressive Fire | gains Shock |
| Double MG | Tracer Rounds | gains Incendiary |
| Double MG | Gyro Mount | reroll one missed to-hit die once |
| Autocannon | AP Shells | gains Armour Piercing |
| Autocannon | Depleted Core | +2 STR |
| Arc Gun | Systems Overload | on hit, target loses 1 action on its next activation |
| Arc Gun | Ion Burn | gains Incendiary |
| Mortar | Airburst Fuze | ignores cover |
| Mortar | Cluster Shells | on hit, chips 1 SP from a second random location on the target |
| Sniper Cannon | Match Barrel | no far-range ACC penalty |
| Sniper Cannon | Marksman Optics | gains Precision |
| Sword | Duelist's Balance | gains Precision |
| Sword | Keen Edge | gains Rend |
| Circular Saw | Tempered Teeth | gains Armour Piercing |
| Circular Saw | Sunder | on damaging hit, struck location max SP is reduced by 1 |
| Chainsaw | High-Rev Motor | +2 STR; firing/striking adds 1 heat |
| Chainsaw | Ripper Teeth | gains Rend |
| Claw | Vice Grip | gains Impale |
| Claw | Rending Talons | gains Rend |
| Lance | Couched Reach | melee range increases by 1 inch for rules display and attack validation metadata |
| Lance | Spearpoint | gains Impale |
| Wrecking Ball | Haymaker | +3 STR |
| Wrecking Ball | Wrecking Momentum | gains Staggering |

The current attack wizard still asks the user to declare range manually. For Couched Reach, the engine exposes the weapon's updated range profile and the UI/rules text show the longer melee reach; full tabletop distance measurement remains player-declared as it is today.

## New State Needed

Systems Overload needs one small state field on the target:

```js
actionPenaltyNextActivation: 0
```

When a Rig with this penalty activates, its `actionsMax` is reduced by the penalty and then the field is cleared. It cannot reduce actions below 0.

Sunder reduces a component's max SP and clamps current SP to the new max. It never reduces a component max below 1.

## UI

In `rig-wizard.js`, replace read-only upgrade tags with two selectable buttons/cards under each weapon selector. The selected upgrade is highlighted and sent in the `add` command.

In `tracker.js`, display only the selected upgrade for each weapon, not both possible upgrades.

Keep the existing modal structure and CSS conventions; this is a behavioral change, not a visual redesign.

## Rules Documentation

Update `rules.md` because Gemma reads it as the system prompt. The rulebook should say:

- Each weapon has two upgrade options.
- Choose one upgrade per equipped weapon at commission.
- The selected upgrade modifies only that weapon.
- Include the full weapon-upgrade table and effect text.

Remove the old note that weapon customization is fixed display-only data and future combat work.

## Tests

Add focused tests before implementation:

- `makeRig` stores default and explicit valid upgrade choices.
- invalid upgrade ids fall back to a valid choice.
- legacy Rig objects are backfilled with valid upgrade choices.
- selected upgrades alter combat profiles: one ROF/heat example, one perk-gain example, one STR example.
- Systems Overload applies and clears the next-activation action penalty.
- Sunder reduces max SP and clamps current SP.
- tracker/wizard behavior can be covered at the pure data layer; browser-level verification is manual unless a browser test harness already exists.

## Out of Scope

- More than two upgrade choices per weapon.
- Picking two upgrades per weapon.
- A points or budget system.
- Post-commission editing of upgrades.
- Automated measurement or line-of-sight validation.
