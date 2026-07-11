# Action Battle Audio — Design

**Date:** 2026-07-11
**Status:** Approved for planning

## Goal

Give the battle a voiced, cockpit feel: when a player performs an action, the app
plays a **screamed soldier voice bark** layered together with a **mechanical /
impact SFX bed**, mixed as one sound. No AI model involved — playback is driven
entirely client-side off the existing command flow. Clips are pre-recorded human
voice (screamed), already present in the repo.

Non-goal: narration text-to-speech (that already exists in `useSpeech.ts` and is
independent of this feature). No changes to Gemma, the prompt, or the `[[RIG …]]`
protocol.

## Existing assets

Recorded clips live in `client/src/assets/sounds/`:

**Voice barks (screamed):**
- `fire_firing`, `fire_eat_this`, `fire_rounds_downrange`, `fire_light_em_up`
- `disengage_fall_back`, `disengage_breaking_off`, `disengage_get_out`
- `overclock_redline_it`
- `purge_venting_clear`, `purge_dumping_heat`

**SFX beds:**
- `tank_getting_shot_1`, `tank_getting_shot_2` — taking a hit
- `massive_mechanical_1`, `massive_mechanical_2`, `massive_mechanical_3` — servos / heavy machinery
- `old_panel_beep` — console blip

More barks (e.g. weapon abilities) will be recorded later; the registry just grows.

## Architecture

Four small units, each independently testable.

### 1. Asset loader — `client/src/lib/soundAssets.ts`

Pulls every clip in as a bundled, hashed URL via Vite:

```ts
const urls = import.meta.glob("../assets/sounds/*.mp3", {
  eager: true, query: "?url", import: "default",
}) as Record<string, string>;
```

Exposes `soundUrl(stem: string): string | null` that maps a bare stem
(`"fire_firing"`) to its hashed URL, returning `null` when the file is absent.
This is what makes the system **placeholder-swap ready**: an unrecorded stem
resolves to `null` and that layer is simply skipped.

**Depends on:** Vite glob import only.

### 2. Action registry — `client/src/lib/actionAudio.ts`

Static map: action key → `{ voices: string[]; sfx: string[] }` (stems, not URLs).
A layer with an empty list, or whose stems all resolve to `null`, plays silent.

| action key | voice stems | sfx stems |
|---|---|---|
| `fire` | fire_firing, fire_eat_this, fire_rounds_downrange, fire_light_em_up | massive_mechanical_1/2/3 |
| `aimed` | *(reuse fire barks)* | massive_mechanical_1/2/3 |
| `overclock` | overclock_redline_it | massive_mechanical_1/2/3 |
| `move` | — | massive_mechanical_1/2/3 |
| `sprint` | — | massive_mechanical_1/2/3 |
| `disengage` | disengage_fall_back, disengage_breaking_off, disengage_get_out | — |
| `purge` | purge_venting_clear, purge_dumping_heat | — |
| `reload` | — | old_panel_beep |
| `prepare` | — | old_panel_beep |
| `shutdown` | — | old_panel_beep |

Action keys without an entry (`harden`, `jumpjets`, `emergencypatch`, `lock`, …)
play nothing in v1 — safe default, no crash.

A separate constant maps the **damage event** (not an action) to
`tank_getting_shot_1/2`.

**Depends on:** `soundAssets` (only at play time, to resolve stems).

### 3. Mixer — `client/src/lib/audioMixer.ts`

A tiny singleton wrapper over the Web Audio API. Web Audio (not `<audio>`)
because simultaneous overlap of two layers with independent volume is the whole
point, and it handles rapid re-triggering without the single-element cutoff
`HTMLAudioElement` suffers.

Responsibilities:
- Lazily create one `AudioContext` on first use.
- Fetch each URL once and `AudioContext.decodeAudioData` it, caching the
  resulting `AudioBuffer` (clips are small; decode-on-first-play is fine, and the
  first battle action is the natural warm-up point).
- `play(voiceStems: string[], sfxStems: string[])`:
  - Resolve stems → URLs via `soundAssets`, dropping `null`s.
  - Pick one voice + one sfx at random, avoiding the immediately-previous index
    per category (tracked in module state) so repeats don't cluster.
  - Play each through its own `GainNode`: **voice gain 1.0, sfx gain ~0.5** so the
    scream cuts through the bed.
- `setEnabled(on: boolean)` — module-level flag; `play()` no-ops when off.
- Respect the browser autoplay policy: the `AudioContext` is first resumed inside
  a user-gesture handler. The triggering action is always a tap/click, so the
  first `play()` runs inside a gesture and unlocks cleanly. If `state === "suspended"`,
  call `resume()` before scheduling.

Pure-ish and unit-testable: inject the `AudioContext` factory and a `fetch`/decode
shim so tests assert selection logic (no-repeat, null-skip, enabled gate) without
real audio.

**Depends on:** `soundAssets`, browser Web Audio API.

### 4. Triggers

Two entry points, both already-existing chokepoints.

**a. Action commands — `client/src/hooks/useCommands.ts`**

Inside the returned callback, before the `fetch` (fire optimistically, don't wait
on the server round-trip):

```ts
if (verb === "action" && typeof attrs.action === "string") {
  playAction(attrs.action);   // from actionAudio; no-op if disabled / unmapped
}
```

`playAction(key)` looks up the registry entry and calls
`mixer.play(entry.voices, entry.sfx)`. This fires for the local player's own
actions only — remote players' actions arrive via socket `applyServerState`, never
through `useCommands`.

Coverage confirmed against the codebase:
- `ActionConsole.onAction` → `sendCommand("action", {action:key})` for the
  straight-through keys, and via `BattleActionsContext` (`openMove`, `openRepair`,
  `openPrepare`) which all also dispatch `sendCommand("action", …)`.
- `AttackWizard` submit → `sendCommand("action", {action: mode})` for
  `fire`/`aimed`/`lock`.
- **Known gap:** Return-Fire dispatches `sendReact({attack})` (`verb:"react"`), so
  it will not bark in v1. Acceptable; revisit if wanted.

**b. Damage taken — `client/src/hooks/useBattleWatchers.tsx`**

Add one `useEffect` that, on each `rigs` change, compares each rig's total
Structure Points to the previous render (kept in a `useRef<Map<id, number>>`).
When any rig's total SP **drops**, play the damage SFX
(`mixer.play([], ["tank_getting_shot_1","tank_getting_shot_2"])`). First render
seeds the baseline without playing. This rides the same state stream the other
watchers already use.

## Toggle & persistence — `client/src/state/UiStateContext.tsx`

Add `battleAudioOn: boolean` + `setBattleAudioOn(v)`. Persist to `localStorage`
(key `battleAudioOn`, default `true`). An effect mirrors the value into
`mixer.setEnabled(...)` so the mixer stays a plain singleton with no React
dependency.

A mute button surfaces in the battle HUD (`BattleHud.tsx`), next to existing
controls — a speaker glyph toggling `battleAudioOn`. Kept separate from the
narration-TTS toggle so the two never talk over each other; the player controls
them independently.

## Data flow

```
tap action tile
  → ActionConsole.onAction / BattleActions / AttackWizard
    → useCommands(verb="action", attrs)
        → playAction(attrs.action)
            → actionAudio registry lookup
                → mixer.play(voices, sfx)
                    → soundAssets stem→URL, decode+cache, 2× GainNode, resume ctx
    → fetch POST /command  (unchanged, parallel)

enemy fire resolves → server state → applyServerState
  → rigs SP total drops → useBattleWatchers damage effect
      → mixer.play([], tank_getting_shot)
```

## Error handling

- Missing file (stem→`null`): that layer skipped; if both null, `play` is a no-op.
- `decodeAudioData` / fetch failure: caught, logged once per URL, that clip
  disabled for the session — never throws into React.
- No `AudioContext` support (old browser): mixer degrades to a no-op; feature
  silently off.
- Toggle off: `play()` returns immediately, no fetch/decode.

## Testing

- **`soundAssets`**: `soundUrl` returns a URL for a known stem, `null` for unknown.
- **`actionAudio`**: registry has expected keys; `playAction` calls mixer with the
  right stems; unmapped key is a no-op.
- **`audioMixer`** (with injected ctx + decode shim): enabled gate; null-stem skip;
  no-immediate-repeat selection; voice vs sfx gain wiring; suspended→resume.
- **`useBattleWatchers`** damage effect: SP drop triggers one damage play; first
  render seeds silently; SP increase (repair) does not trigger.
- **`useCommands`**: `verb:"action"` triggers `playAction`; other verbs do not.
- Existing suites (`RigWizard`, `AttackWizard`, etc.) must stay green.

## Scope

**In:** the 10 mapped action keys above, damage SFX, layered voice+sfx mix, mute
toggle with persistence.

**Out (future):** weapon-ability barks (Harpoon Winch, Rivet Lock, …), Return-Fire
bark, per-rig voice variation, spatial/positional audio, opponent-action audio,
TTS-generated fills.
