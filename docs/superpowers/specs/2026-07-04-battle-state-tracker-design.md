# Battle State Tracker + Shared Multiplayer — Design

Date: 2026-07-04

Extends
[2026-07-04-rig-condition-tracker-design.md](2026-07-04-rig-condition-tracker-design.md).

## Motivation
Two drivers:

1. **The reported bug.** Saying "add a new heavy rig" to Gemma immediately emitted
   a `[[RIG add]]` command instead of asking for the Rig's name and weapons. Root
   cause: `TRACKER_PROTOCOL` in `server.js` is purely *reactive* ("player narrates
   a change → emit a tag") and never tells the model a Rig is *incomplete* without
   a name and weapons, so there is no gather-then-act behavior. Weapons were also
   never part of the data model.
2. **New scope.** The tracker grows from single-player "Rig condition" into a
   full **shared battle** control panel: two players in the **same room** see one
   authoritative game state (your Rigs *and* the enemy's), plus a Recovery Phase,
   round counter, Victory Points / objectives, and per-Rig Prepare tokens.

## Rulebook grounding (source of truth)
- Every Rig **must carry at least 2 weapons** matching its weight class; Colossal
  carries **2 + 1 Hull-mounted = 3** (`rules.md` §Squadron Building, ~line 110).
  Heavy & Colossal weapon profiles are **not yet written** (`rules.md:427`).
- A game is **5 rounds**; each round is Initiative → Activation → **Recovery**
  (`rules.md:128`).
- **Recovery Phase**, in order (`rules.md:134`): (1) each Rig reduces heat by
  **2** unless forbidden; (2) remove all untriggered **Prepare** tokens;
  (3) **score objectives**; (4) resolve other end-of-round effects.
- Each Recovery Phase a side scores the VP of every marker it controls
  (`rules.md:320`).
- A catastrophic Engine's heat cannot be cooled below **3** (`engineHeatFloor`).

## Architecture — shared state via polling (no sockets)

**Server owns authoritative state.** Game + Rig state moves out of the browser's
`localStorage` and into the server, keyed by **room code**. The browser keeps
only the player's *identity* (`{ room, side }`).

**Rooms.** State is a map `code → room`. Players create/enter a code (e.g.
`IRON42`) and claim one of two sides. Multiple concurrent games can exist.

**Command-based sync (the correctness cornerstone).** Clients never overwrite the
whole state — two players would clobber each other. Instead every change (a manual
button tap *or* a tag Gemma emitted) is POSTed as a **command** (`damage`, `heat`,
`recovery`, `vp`, …) that the server applies to authoritative state, bumping a
monotonic `version`. Commands are deltas, so two players editing different Rigs
never conflict; same-field edits resolve last-write-wins and converge within one
poll. This reuses the tag protocol we already have as the network mutation API.

**The 3-second poll.** Each client runs `GET /api/game/:room` every **3 s**,
receiving `{ version, state }`, and re-renders **only when `version` changed**
(cheap; avoids flicker and lost input focus). It also polls immediately after
sending its own command and after Gemma's turn, so a player sees their own edits
without waiting.

**Durability.** Rooms live in memory and are flushed to a JSON file
(`data/rooms.json`) on each write, so a server restart doesn't wipe a battle.

## Scope decisions (agreed)
- **Named room codes** for shared games (not a single global game).
- **Rig ownership is now in scope** (was a non-goal): each Rig has `owner`; the
  viewer sees their own side's Rigs as "yours", the other side's as "enemy".
- **Track weapons for real** — first-class data (Rig field + tag + UI).
- **Weapon validation:** Gemma matches a named weapon against the Weapon Profiles
  in the rulebook (in the system prompt). Match (case-insensitive / close) → use
  the canonical name; no match → accept it as a custom weapon. (Heavy/Colossal
  always take the "create" path until profiles exist — consistent, not a bug.)
- **Two named sides** for VP/objectives; objectives are `{label, vp, controller}`
  markers.

## Non-goals
- Real accounts / passwords (a "login" is just claiming a side + display name).
- WebSockets / SSE / long-poll (explicitly polling every 3 s).
- Optimistic-conflict resolution beyond last-write-wins + version reconciliation.
- Board positions, ranges, line-of-sight, initiative rolls.
- Weapon weight-class / faction **legality enforcement** (Gemma may note it; the
  app does not block).
- Per-weapon reload/destroyed state; to-hit / Impact resolution.

## Data model (server-authoritative, per room)
```
room = {
  code: "IRON42",
  version: 0,                                   // bumped on every mutation
  game: {
    round: 1,                                   // integer 1..5 (rules.md:128)
    sides: [
      { id: "a", name: "You",   vp: 0, claimed: false },
      { id: "b", name: "Enemy", vp: 0, claimed: false },
    ],
    objectives: [ { id, label: "Alpha", vp: 1, control: "a" | "b" | null } ],
  },
  rigs: [
    { id, name, weightClass, owner: "a" | "b",
      hull:{sp,max,destroyed}, arms:{…}, legs:{…},
      engine:{sp,max,destroyed,heat},
      weapons: string[],                        // canonical or custom, slot order
      prepare: number,                          // Prepare-token count (>= 0)
      destroyed: bool },
  ],
}
```
The Rig SP/heat rules (defaults, `engineHeatFloor`, `recompute`, damage/repair/
set/heat) move to the server unchanged in behavior. `owner` and the viewer's
claimed `side` decide the "yours vs enemy" split at render time.

**Client-side persistence** shrinks to identity only: `localStorage` keeps
`{ room, side }` so a refresh rejoins the same room as the same side. All battle
data comes from the server.

## HTTP API
```
POST /api/game/:room/join        { name, side? }
    → claims a free side (or the requested one); creates the room if new.
      Returns { side, version, state }.
GET  /api/game/:room             → { version, state }        # the 3 s poll
POST /api/game/:room/command     { cmd }                      # one mutation
    → applies cmd, bumps version, returns { version, state }.
POST /api/chat                   { room, messages, think }    # unchanged shape + room
    → injects THIS room's CURRENT BATTLE STATE into the system prompt and streams
      Gemma's reply. Gemma's emitted tags are parsed client-side and re-sent as
      /command calls (chat stays per-client; mutations stay server-authoritative).
```
`cmd` is a normalized `{ verb, attrs }` — the same verbs as the tags below.
Node is single-threaded, so applying a command + bumping version + flushing is
atomic without locks. Unknown/invalid commands are ignored (return current state).

## Command / tag protocol
Gemma emits tags in its reply (as today); the client extracts them, strips them
from display + TTS, and POSTs each as a `/command`. Manual UI actions build the
same commands directly.

### Existing Rig verbs (unchanged semantics, now server-applied)
`add`, `damage`, `repair`, `heat`, `set`, `remove`.

### New / extended
```
# Weapons
[[RIG add name="Warden" class="heavy" owner="a" weapons="Autocannon; Chain Fist"]]
[[RIG weapons name="Warden" list="Autocannon; Arc Sword"]]   # absolute loadout set

# Prepare tokens
[[RIG prepare name="Warden" amount="+1"]]        # "+n"/"-n" relative; "0"/"n" absolute

# Battle state
[[GAME recovery]]                                # full Recovery Phase (order below)
[[GAME round set="3"]]                            # absolute 1..5
[[GAME vp side="You" amount="+2"]]               # "+n"/"-n" relative; "n" absolute
[[GAME objective add label="Alpha" vp="1" control="You"]]     # control = You|Enemy|none
[[GAME objective control label="Alpha" side="Enemy"]]
[[GAME objective remove label="Alpha"]]
```
`owner`/`side` accept a side's display name or id ("a"/"b"); when Gemma omits
`owner` on `add`, the server assigns the requesting player's side. `weapons`/
`list` split on `;` (trim, drop empties). A `GAME_TAG_RE`
(`/\[\[GAME\b([^\]]*?)\]\]/gi`) mirrors `RIG_TAG_RE`; both families are stripped
from display + TTS.

## Recovery Phase semantics (`[[GAME recovery]]` and the manual button)
Apply, in this exact order, once:
1. **Cool:** every Rig `heat = max(engineHeatFloor(rig), heat - 2)`.
2. **Clear Prepare:** every Rig `prepare = 0`.
3. **Score objectives:** every objective with non-null `control` adds its `vp` to
   that side's `vp`.
4. **Advance round:** `round = min(5, round + 1)`.

Runs as a single server command (`{verb:"recovery"}`). Gemma then speaks a
one-line summary in the player's language and never reads the tag aloud.

## Prompt changes (`server.js`)
### Gather-then-act (the core behavior fix)
> A Rig is only complete with a **name** and its **weapons**. Light/Medium/Heavy
> carry **2** weapons; Colossal carries **3** (2 + 1 Hull-mounted). If the player
> asks to add a Rig without giving the name and/or all its weapons, do **NOT**
> emit `[[RIG add]]` yet — ask (in the player's language) for what's missing, then
> emit the add once you have the name and all weapons.

### Weapon validation
> When the player names a weapon, match it against the Weapon Profiles in the
> rulebook above. Match (ignoring case / minor spelling) → use that weapon's exact
> name; no match → still accept it as a custom weapon.

### Battle-state awareness
- Document every new tag with one-line semantics, including the Recovery order.
- `formatRigState` → `formatBattleState(room)` emitting **`CURRENT BATTLE STATE`**:
  round (n/5), both sides' names + VP, objectives, and per-Rig lines that include
  `owner`, `weapons`, and `prepare`. `/api/chat` looks the room up by `:room`/body
  and injects its state.

## Client changes (`index.html`)
- **Join flow:** a small gate before the terminal — enter room code, display
  name, pick a free side; persist `{ room, side }` to `localStorage`; auto-rejoin
  on refresh.
- **Polling loop:** `setInterval` GET every 3 s; diff on `version`; re-render Rig
  panel + Battle section on change. Immediate poll after any command and after
  Gemma's turn.
- **Command sender:** `sendCommand({verb, attrs})` POSTs to `/command` and applies
  the returned state. Manual buttons and parsed Gemma tags both go through it.
  The old local mutation functions become thin command builders; authoritative
  math lives on the server.
- **Rendering "yours vs enemy":** Rig list splits by `owner` relative to the
  player's `side` — a "Your Squadron" group and an "Enemy" group (enemy cards
  read-only for damage buttons is optional; default allow editing since it's a
  shared tabletop aid).
- **Battle section** (top of the Squadron Status sheet): round pill (1–5), both
  sides' VP with editable names + −/＋, a **▶ Recovery Phase** button, and an
  objectives mini-list (label · vp · controller toggle · remove) + add form.
- **Rig card:** a **Weapons** line and a small **Prepare** −/＋ indicator; an
  owner badge (You/Enemy).
- **Manual add form:** weapons text input (comma/semicolon split) + an owner
  selector (defaults to your side); lenient (no hard 2-weapon minimum by hand).

## Server changes (`server.js`)
- Room store: in-memory `Map`, flushed to `data/rooms.json` on write; loaded at
  startup.
- Move Rig math (defaults, `recompute`, damage/repair/set/heat, `engineHeatFloor`)
  server-side; add `applyCommand(room, cmd)` covering all Rig + GAME verbs and
  `recovery`; bump `version`; persist.
- New routes: `POST /join`, `GET /:room`, `POST /:room/command`; `/api/chat`
  gains `room` and injects `formatBattleState`.
- `TRACKER_PROTOCOL` gains the gather rule, weapon-validation rule, and new tag
  docs.

## Implementation phases (each its own plan)
1. **Shared-state foundation** — server-authoritative rooms, `join` / poll /
   `command` endpoints, `data/rooms.json` durability, move existing Rig-condition
   math server-side, client join gate + 3 s polling + command sender, Rig
   ownership + "yours vs enemy" rendering, `/api/chat` room injection. *Delivers
   shared multiplayer for the features that exist today.*
2. **Weapons + agentic gather** — Rig `weapons`, `add`/`weapons` verbs, gather +
   validation prompt rules, card Weapons line, manual weapons input. *Resolves the
   originally reported issue.*
3. **Round counter + Recovery Phase** — `game.round`, `recovery` command (steps
   1 & 4), `round set`, round pill + Recovery button.
4. **Prepare tokens** — Rig `prepare`, `prepare` verb, card indicator; wire into
   Recovery step 2.
5. **VP / objectives** — `game.sides` VP + `game.objectives`, `vp` and
   `objective` verbs, Battle-section UI; wire into Recovery step 3.

## Testing
- **Server unit-ish:** `applyCommand` — damage/repair/set/heat honor the SP model
  and heat floor; `recovery` cools by 2 without breaching the floor, zeroes
  Prepare, scores controlled objectives to the right side, caps round at 5;
  `add` assigns `owner`; `join` claims the first free side and creates rooms;
  `version` increments once per mutation; unknown commands are no-ops.
- **Sync:** two clients on one room — a command from A appears in B's next poll;
  `version` gates re-render; a restart reloads `rooms.json` intact.
- **Prompt/behavior (manual):** "add a heavy rig" → Gemma asks for name + weapons,
  emits no tag; supplying both → one `[[RIG add … weapons=…]]`. "do a recovery
  phase" → one `[[GAME recovery]]`, correct summary, hidden from TTS. Known weapon
  normalizes to canonical spelling; unknown accepted as-is.
- **Persistence/identity:** refresh rejoins the same room as the same side; battle
  state survives reload and server restart; **🧹 Clear** wipes local chat history
  only, never room state.
