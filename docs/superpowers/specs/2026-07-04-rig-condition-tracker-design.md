# Rig Condition Tracker — Design

Date: 2026-07-04

## Goal
Extend the *Of Oil and Iron* rules-master app so it also tracks the in-game
condition of Rigs. Gemma (via voice/TTS) must be able to trigger condition
changes, and manual UI editing must also work.

## Rulebook model (source of truth)
Each Rig has four components, each with Structure Points (SP) and an Armour
score. The Engine additionally tracks Heat.

Default SP by weight class:

| Component | Light | Medium | Heavy | Colossal |
|-----------|-------|--------|-------|----------|
| Hull      | 6     | 7      | 8     | 9        |
| Arms      | 5     | 6      | 7     | 8        |
| Legs      | 5     | 6      | 7     | 8        |
| Engine    | 4     | 5      | 6     | 7        |

Component states: `ok` (sp>0) → `catastrophic` (sp==0) → `destroyed`
(additional damage while at 0). Rig destroyed when Hull or Engine is destroyed,
or all four components reach 0 SP. Engine heat cannot drop below 3 once the
engine is catastrophically damaged.

## Command protocol (gemma → tracker)
Gemma embeds forgiving text tags in its reply. Applied once after the stream
completes, then stripped from display + TTS.

```
[[RIG add name="Stalker" class="heavy"]]
[[RIG damage name="Stalker" loc="hull" amount="3"]]
[[RIG repair name="Stalker" loc="legs" amount="1"]]
[[RIG heat name="Stalker" amount="+2"]]   # "-1", "0" (vent), or absolute "5"
[[RIG set name="Stalker" loc="engine" sp="0"]]
[[RIG remove name="Stalker"]]
```

`loc` ∈ hull|arms|legs|engine. Tag chosen over JSON tool-calls because this
Gemma GGUF is not registered as tool-capable (see server.js comment).

## Client state (localStorage)
```
rig = { id, name, weightClass,
  hull:{sp,max,destroyed}, arms:{sp,max,destroyed},
  legs:{sp,max,destroyed}, engine:{sp,max,destroyed,heat} }
```

## Server changes (server.js)
- `/api/chat` accepts an optional `rigs` array from the client.
- System prompt gains: (a) the command protocol + instruction to emit a tag on
  any narrated condition change and speak a short confirmation in the user's
  language; (b) a live `CURRENT RIG STATE` dump built from the `rigs` snapshot.

## UI changes (index.html)
- Header toggle `🛠 Rigs` shows/hides a tracker panel.
- Rig card: name, weight-class badge, four SP bars (green→amber→red→grey),
  engine heat gauge, status line, per-component `−/＋`, heat `−/＋`, remove.
- Add-rig form (name + class → auto-fill SP).
- Parse+strip `[[RIG ...]]` tags from streamed answer; apply to state; persist.

## Non-goals
- Damage-overflow location re-targeting (manual).
- Armour / to-hit resolution (gemma already answers those as rules questions).
