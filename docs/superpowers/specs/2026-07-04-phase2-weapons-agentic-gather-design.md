# Phase 2 - Weapons + Agentic Gather Design

Date: 2026-07-04

Extends:
- [2026-07-04-battle-state-tracker-design.md](2026-07-04-battle-state-tracker-design.md)
- [../plans/2026-07-04-phase1-shared-state-foundation.md](../plans/2026-07-04-phase1-shared-state-foundation.md)

## Goal

Complete the Phase 2 weapon slice on top of the shared multiplayer foundation.
The app should only create a Rig when it has a complete, valid loadout, and Gemma
should gather missing creation details before emitting a tracker command.

This phase resolves the reported behavior where "add a heavy rig" produced an
immediate incomplete `[[RIG add]]` tag. After Phase 2, Gemma asks for every
missing required field at once and emits no add tag until it can produce a valid
command.

## Scope

Phase 2 uses the existing structured weapon model:

```js
weapons: {
  longRange: "Mini Gun",
  melee: "Sword",
}
```

Only `light` and `medium` Rig creation is supported in this phase. `heavy` and
`colossal` remain out of scope because their weapon profiles/rules are not ready
for this implementation slice.

Weapons are immutable after creation. There is no `RIG weapons` command in this
phase; to fix a loadout, remove the Rig and add it again.

## Non-Goals

- No custom or unknown weapons.
- No post-creation weapon editing.
- No Heavy or Colossal creation.
- No server-side fuzzy matching.
- No rulebook Markdown parsing for weapon lists.
- No Prepare, Round/Recovery, VP, or objective behavior.

## Authoritative Weapon List

The code is authoritative for valid weapons. `WEAPONS` in
`shared/game-state.js` supplies the valid `longRange` and `melee` options used by
the server, prompt text, tests, and manual UI.

The server validates weapon names by case-insensitive exact match against that
list and stores the canonical value from `WEAPONS`.

Examples:

- `mini gun` -> `Mini Gun`
- `MINI GUN` -> `Mini Gun`
- `mini-gun` -> invalid at the server layer unless `mini-gun` is present in
  `WEAPONS`

Gemma may interpret imperfect player wording, but it must convert that wording
to an exact valid weapon name before emitting a tag.

## Command Protocol

The only Phase 2 weapon-bearing mutation is `RIG add`:

```text
[[RIG add name="Warden" class="light|medium" owner="a|b" lr="Mini Gun" melee="Sword"]]
```

Accepted attributes:

- `name`: required, non-empty Rig name.
- `class`: required for new creation; only `light` or `medium`.
- `owner`: optional side id/name; omitted owner defaults to the requesting side.
- `lr` or `longRange`: required long-range weapon.
- `melee`: required melee weapon.

Rejected commands are no-ops: they do not create a Rig, do not increment
`nextRigId`, do not bump `version`, and do not persist a state change.

Rejected cases:

- Missing `name`.
- Duplicate Rig name.
- Missing long-range or melee weapon.
- Unknown weapon.
- Heavy or Colossal class.
- Unknown class.

## Gemma Behavior

Gemma's prompt must teach the gather-before-act rule:

If the player asks to create a Rig and any required field is missing or invalid,
Gemma asks for every missing field in one response and emits no `[[RIG add]]`
tag.

Required fields:

- Rig name.
- Supported class: `light` or `medium`.
- One valid long-range weapon from `WEAPONS.longRange`.
- One valid melee weapon from `WEAPONS.melee`.

If the player gives imperfect weapon information, Gemma should map it to the
closest valid weapon when the intent is clear. If intent is not clear, it asks a
follow-up and includes valid options. The server still remains strict and only
accepts exact code-list weapons case-insensitively.

Examples:

- Player: "add a light rig"
  - Gemma asks for name, long-range weapon, and melee weapon.
  - Gemma emits no tag.
- Player: "add a medium rig called Warden with mini gun and sword"
  - Gemma emits `[[RIG add name="Warden" class="medium" lr="Mini Gun" melee="Sword"]]`.
- Player: "add a heavy rig called Breaker with mini gun and sword"
  - Gemma says Heavy Rigs are not available in the tracker yet and asks for
    `light` or `medium`.
  - Gemma emits no tag.
- Player: "add a light rig called Vela with plasma cannon and sword"
  - If `plasma cannon` is not in `WEAPONS.longRange`, Gemma asks for a valid
    long-range weapon.
  - Gemma emits no tag.

## UI Behavior

The manual add form hides Heavy and Colossal options. It shows only supported
classes: `light` and `medium`.

The long-range and melee controls are dropdowns populated from `WEAPONS`.
Because the UI uses dropdowns, manual creation cannot submit unknown weapons.

Rig cards continue to show the selected structured loadout:

```text
Mini Gun / Sword
```

## Data Flow

1. Manual UI or Gemma emits a `RIG add` command with `class`, `name`, `lr`, and
   `melee`.
2. The browser posts the command to `/api/game/:room/command`.
3. The server calls `applyCommand(room, cmd, context)`.
4. `applyCommand` validates supported class and weapons against code constants.
5. On success, the server creates the Rig, canonicalizes weapon names, bumps
   room `version`, persists the room, and returns the new public state.
6. On failure, the server returns the current public state unchanged.
7. Polling keeps both clients converged as in Phase 1.

## Testing

Server tests should cover:

- `add` succeeds for `light`/`medium` with valid `lr` and `melee`.
- Weapon names canonicalize case-insensitively.
- Missing weapon, unknown weapon, unknown class, Heavy, and Colossal are no-ops.
- Invalid adds do not burn `nextRigId` and do not bump `version`.
- Existing damage/repair/heat behavior still works for valid weapon-bearing Rigs.
- `formatBattleState` includes weapons.

Prompt/manual tests should cover:

- "add a light rig" asks for all missing fields and emits no tag.
- Supplying all valid fields emits one valid structured `RIG add`.
- Imperfect but clear weapon wording is normalized by Gemma before tagging.
- Unknown weapon requests cause Gemma to ask again with valid options.
- Heavy/Colossal requests are refused for now with no tag.

UI tests should cover:

- Heavy and Colossal are not present in the class selector.
- Weapon dropdowns are populated from `WEAPONS`.
- A manually added Rig sends `lr` and `melee` in the command payload.

## Acceptance Criteria

- Players can add Light and Medium Rigs only when both valid weapon slots are
  supplied.
- Unknown/custom weapons cannot enter authoritative state.
- Heavy and Colossal cannot be created through UI or command tags.
- Gemma does not create incomplete Rigs.
- Gemma asks for all missing creation fields at once.
- Shared multiplayer behavior from Phase 1 remains unchanged.
