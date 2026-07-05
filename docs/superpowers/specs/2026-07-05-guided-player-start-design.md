# Guided Player Start - Design

Date: 2026-07-05

## Motivation
Gemma can currently answer rules questions and can create tracked Rigs when the
player gives complete details. That is not enough for a brand-new player who
does not know the rules or the weapon profile names.

The desired behavior is a guided one-player setup assistant. Gemma talks to the
current player only, helps register that player's three glued minis as playable
Rigs, then walks that player through deployment, the goal of the game, and what
to do next.

## Rulebook grounding
- A standard game uses 3-5 Rigs per side; Salvage is tuned for 3 Rigs per side.
- Only Light and Medium Rigs are currently playable in the app tracker.
- Every playable Rig must have exactly one Long Range weapon and one Melee
  weapon.
- Deployment uses opposite corners, three objectives, alternating Rig placement,
  declared facing, and Round 1 initiative determined by deployment order.
- The goal is to score salvage objectives during Recovery, or win immediately by
  destroying all enemy Rigs.

## Scope
This feature is for one player at a time. Gemma should never try to coordinate
both players in one conversation. If the opponent still needs setup, Gemma can
say so as table guidance, but it should continue helping only the current
player's side.

## Player-facing flow
Gemma should recognize a start request such as:

- "Help me start"
- "I don't know how to play"
- "Walk me through setup"
- "Help me make my three rigs playable"

Once triggered, Gemma guides this loop:

1. Count the current player's tracked Rigs from CURRENT BATTLE STATE.
2. If fewer than 3 complete own-side Rigs exist, ask for the next mini.
3. For that mini, ask for name, Light/Medium class, visible ranged weapon
   description, and visible melee weapon description.
4. If any field is missing, ask only for the missing field(s).
5. For each weapon description that is not an exact canonical profile, present
   2-3 likely legal matches and ask the player to choose.
6. Only after the player confirms exact legal weapon profiles, emit the hidden
   `[[RIG add ...]]` tag.
7. Repeat until the current player has 3 complete own-side Rigs.
8. Then shift to deployment guidance.

## Strict weapon matching
The minis already have weapons glued on, so Gemma is not helping the player
choose an optimal loadout. It is helping the player map visible sculpt details
to the closest legal rule profiles.

When the player's description is vague or non-canonical, Gemma should offer
2-3 likely matches rather than making a single guess.

Example:

> "A big shoulder cannon could be one of these: 1. Autocannon - a direct cannon
> profile, 2. Sniper Cannon - a long precision barrel, 3. Mortar - a chunky
> indirect launcher. Which one should I use?"

Gemma must not emit a `[[RIG add]]` tag while waiting for that choice.

Canonical Long Range profiles:

- Mini Gun
- Double MG
- Autocannon
- Arc Gun
- Mortar
- Sniper Cannon

Canonical Melee profiles:

- Sword
- Circular Saw
- Chainsaw
- Claw
- Lance
- Wrecking Ball

## One-player ownership
Gemma should register the Rig to the requesting player's side. The current
implementation already defaults omitted `owner` to the requester's side when the
command is applied. For clarity and robustness, the prompt should still tell
Gemma to set `owner` to the player's side when it knows it.

Gemma should ignore enemy-side setup unless the player explicitly says they are
recording an enemy Rig. Even then, that should not count toward this player's
"three playable Rigs" onboarding checklist.

## Deployment handoff
Once the current player has 3 complete own-side Rigs, Gemma should stop asking
for more minis by default and move to setup guidance:

1. "Your three Rigs are playable."
2. "Make sure the opponent also has three playable Rigs."
3. Place 4-6 terrain pieces by roll-off.
4. Choose opposite-corner diagonal halves.
5. Place three objectives: center worth 2 VP, two toward the empty corners worth
   1 VP each.
6. Alternate placing one Rig at a time, fully within your half, no closer than
   4 inches to the diagonal line, declaring facing.
7. Explain that the player who deploys first activates second in Round 1 and
   receives Answer tokens.
8. Explain the goal: score objectives in Recovery for 5 rounds, or destroy all
   enemy Rigs.

Gemma should present only the next actionable step, then wait. It can summarize
the full flow if asked, but the default should be back-and-forth guidance.

## Prompt architecture
Add a new system-prompt section after the tracker protocol, for example:

`=== NEW PLAYER START GUIDE ===`

That section should define:

- Trigger phrases for guided start.
- The three-Rig own-side completion check.
- The gather-confirm-create loop.
- The strict 2-3 match weapon-disambiguation rule.
- The deployment handoff sequence.
- A "one player at a time" rule.

This can be implemented as prompt-only behavior at first. The current state
model already contains enough information to count own-side Rigs and verify
whether each has a Light/Medium class plus canonical Long Range and Melee
weapons.

## Error handling
- If the player asks for Heavy or Colossal, Gemma explains those are not
  currently available in the tracker and asks for Light or Medium.
- If the player describes a weapon that maps poorly to all legal profiles,
  Gemma presents the closest broad options and says the exact sculpt does not
  have a perfect profile.
- If the player changes their mind before confirmation, Gemma updates the
  pending interpretation and still emits no tag.
- If a Rig name already exists, Gemma asks for a different name or offers to
  update/remove the existing tracked Rig manually.
- If conversation history is cleared after setup, the tracked Rigs remain in
  battle state, so Gemma can continue from deployment.

## Testing
Add prompt tests that assert the new guide includes:

- "one player at a time" or equivalent wording.
- Three own-side playable Rigs before deployment.
- Strict 2-3 likely matches for weapon descriptions.
- No `[[RIG add]]` until exact class and canonical weapons are confirmed.
- Transition to deployment once three own-side Rigs exist.

Manual test prompts:

1. "I don't know how to play, help me start."
   Expected: Gemma asks for the first mini's name/class/visible weapons.
2. "It's called Warden, medium, big shoulder cannon, buzz saw arm."
   Expected: Gemma offers 2-3 Long Range matches and 2-3 Melee matches, no tag.
3. "Use Autocannon and Circular Saw."
   Expected: Gemma emits one `[[RIG add ...]]` tag and asks for the next mini.
4. After three own-side Rigs exist:
   Expected: Gemma says the player's three Rigs are playable and gives the next
   deployment step.

## Non-goals
- Adding board-position tracking.
- Automating line-of-sight, range, or attack resolution.
- Building a full tutorial UI or wizard screen.
- Choosing optimized loadouts for the player.
- Managing both players' full setup conversation at once.
