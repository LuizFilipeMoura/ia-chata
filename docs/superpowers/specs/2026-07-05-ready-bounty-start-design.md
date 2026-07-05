# Ready Bounty Start - Design

Date: 2026-07-05

## Goal

Add an explicit battle-start gate. Each player marks their side Ready after
choosing at least three Rigs. When both sides are Ready, the room starts the
game and the system assigns each side a random enemy Rig as its private
Ironclad Bounty.

## Requirements

- A side can only become Ready when it owns at least three tracked Rigs.
- Both sides' Ready state is visible to both players.
- The game starts automatically once both sides are Ready.
- Bounty targets are assigned exactly once at start.
- Each side's bounty is selected randomly from the opponent's current Rigs.
- A player can see only their own side's bounty on their screen.
- The opponent's bounty must not be sent to that player's browser.
- If Rigs are added or removed before the game starts, both Ready flags reset.

## State Model

The authoritative room state gains:

- `game.started`: boolean, initially `false`.
- `game.sides[].ready`: boolean, initially `false`.
- `game.bounties`: private server-side map of side id to target Rig id.

Public state becomes side-aware. The server still stores both bounty assignments
in the room, but `publicState(room, side)` only includes the requesting side's
bounty. Generic room polling and command responses must pass the requester's
side so the client receives the right private view.

## Commands

Add a `ready` game command:

```text
[[GAME ready side="a|b"]]
```

Manual UI controls can post the same normalized command through the existing
command endpoint. The server validates ownership count before setting Ready.
Invalid Ready attempts are no-ops.

When both sides are Ready, the server calls a start helper that:

1. Confirms each side still has at least three Rigs.
2. Randomly picks one enemy Rig id per side.
3. Stores those picks in `game.bounties`.
4. Sets `game.started = true`.
5. Bumps the room version.

## UI

The Rig panel gets a compact battle setup section near the deck controls:

- Shows both sides' Ready status.
- Shows a Ready button for the current player's side.
- Disables or explains the button until the current side has three Rigs.
- After start, replaces setup text with the player's private Ironclad Bounty.

The bounty display names the target Rig and keeps it local to the requesting
side's client state.

## Privacy

The client must not receive the opponent's bounty assignment. Tests should prove
that `publicState(room, "a")` includes only Side A's bounty and omits Side B's,
and vice versa.

The chat battle-state prompt can include the current player's private bounty
only when the request includes a side. It should not expose both assignments.

## Reset Behavior

Before start, adding or removing any Rig resets both sides to not Ready because
the final lineup changed. After start, Rig condition changes and removals do not
reroll or clear bounties; the target remains the assigned Rig id/name for that
battle.

## Testing

- Shared game-state tests cover Ready validation, automatic start, random
  bounty assignment through an injectable random function, and private public
  state filtering.
- Route tests or static tests cover side-aware public state responses.
- UI static tests cover the Ready control and private bounty rendering hooks.
- Full `npm test` must pass before completion.
