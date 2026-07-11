# Action Battle Audio (V2) — Design

**Date:** 2026-07-11
**Status:** Approved for planning
**Target:** the native V2 frontend (`client/src/v2/`), current `frontend/v2-redesign` branch

## Goal

Give the V2 battle a voiced, cockpit feel: when a player performs an action, the
app plays a **screamed soldier voice bark** layered together with a **mechanical /
impact SFX bed**, mixed as one sound. No AI model involved — playback is driven
entirely client-side off the existing command flow. Clips are pre-recorded human
voice (screamed), already present in the repo.

Non-goal: narration text-to-speech (that lives in the shared `useSpeech.ts` and is
independent). No changes to Gemma, the prompt, or the `[[RIG …]]` protocol.

## V2 constraints

`client/src/v2/no-v1-imports.test.ts` forbids V2 from importing V1 **presentation**
modules, but explicitly **allows** reuse of V1 *logic*: `hooks/useCommands`,
`hooks/useMySide`, `state/RoomStateContext`, `state/UiStateContext`, `lib/*`, and
`/shared/*`. Consequences:

- All new audio code lives under **`client/src/v2/`**.
- It may import the shared `useCommands` and the shared assets folder
  (`client/src/assets/sounds/`) — neither is V1 presentation.
- The V1-era `useBattleWatchers` is banned; the V2 damage trigger goes in
  `client/src/v2/hooks/useV2BattleWatchers.tsx`.

## Existing assets

Recorded clips in `client/src/assets/sounds/` (shared, `.mp3`):

**Voice barks (screamed):**
- `fire_firing`, `fire_eat_this`, `fire_rounds_downrange`, `fire_light_em_up`
- `disengage_fall_back`, `disengage_breaking_off`, `disengage_get_out`
- `overclock_redline_it`
- `purge_venting_clear`, `purge_dumping_heat`

**SFX beds:**
- `tank_getting_shot_1`, `tank_getting_shot_2` — taking a hit
- `massive_mechanical_1`, `massive_mechanical_2`, `massive_mechanical_3` — servos / machinery
- `old_panel_beep` — console blip

More barks (weapon abilities) get recorded later; the registry just grows.

## Architecture

Three audio modules under `client/src/v2/audio/`, one wrapper hook, and two edits
to existing V2 files. Each unit is independently testable.

### 1. Asset loader — `client/src/v2/audio/soundAssets.ts`

Pulls every clip in as a bundled, hashed URL via Vite:

```ts
const urls = import.meta.glob("../../assets/sounds/*.mp3", {
  eager: true, query: "?url", import: "default",
}) as Record<string, string>;
```

Exposes `soundUrl(stem: string): string | null`, mapping a bare stem
(`"fire_firing"`) to its hashed URL, `null` when the file is absent. This makes the
system **placeholder-swap ready**: an unrecorded stem resolves to `null` and that
layer is simply skipped.

**Depends on:** Vite glob import only.

### 2. Action registry — `client/src/v2/audio/actionAudio.ts`

Static map: action key → `{ voices: string[]; sfx: string[] }` (stems). A layer
with an empty list, or whose stems all resolve to `null`, plays silent. Exposes
`playAction(key: string): void`.

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
play nothing in v1 — safe default, no crash. A separate constant maps the **damage
event** (not an action) to `tank_getting_shot_1/2`.

**Depends on:** `soundAssets`, `audioMixer`.

### 3. Mixer — `client/src/v2/audio/audioMixer.ts`

A singleton wrapper over the Web Audio API. Web Audio (not `<audio>`) because
simultaneous overlap of two layers with independent volume is the whole point, and
it handles rapid re-triggering without the single-element cutoff
`HTMLAudioElement` suffers.

Responsibilities:
- Lazily create one `AudioContext` on first use.
- Fetch each URL once and `AudioContext.decodeAudioData` it, caching the resulting
  `AudioBuffer` (clips are small; decode-on-first-play is fine).
- `play(voiceStems, sfxStems)`: resolve stems → URLs (drop `null`s), pick one
  voice + one sfx at random avoiding the immediately-previous index per category,
  play each through its own `GainNode` — **voice gain 1.0, sfx gain ~0.5** so the
  scream cuts through.
- Autoplay policy: resume the `AudioContext` if `state === "suspended"` before
  scheduling. The first `play()` runs inside an action tap (a user gesture), so it
  unlocks cleanly.
- **Enabled state + persistence, as an external store**: holds `enabled` (seeded
  from `localStorage["v2BattleAudioOn"]`, default `true`), plus
  `subscribe(cb)` / `getSnapshot()` / `setEnabled(v)` (writes localStorage,
  notifies subscribers). `play()` no-ops when disabled. This lets a hook bind to it
  with `useSyncExternalStore`, so no React provider or `V2Providers` ordering
  change is needed.

Testable with an injected `AudioContext` factory + fetch/decode shim: assert the
enabled gate, null-stem skip, no-immediate-repeat selection, and voice/sfx gain
wiring — no real audio.

**Depends on:** `soundAssets`, browser Web Audio API, `localStorage`.

### 4. Command wrapper — `client/src/v2/hooks/useV2Commands.ts`

Thin wrapper so audio stays a V2 concern instead of editing shared `useCommands`:

```ts
export function useV2Commands() {
  const send = useCommands();               // shared V1 logic — allowed
  return useCallback((verb, attrs = {}) => {
    if (verb === "action" && typeof attrs.action === "string") {
      playAction(attrs.action);             // fire optimistically, don't await server
    }
    return send(verb, attrs);
  }, [send]);
}
```

Swap the `useCommands` import → `useV2Commands` in the three V2 action-dispatch
sites: `v2/state/V2BattleActionsContext.tsx`, `v2/battle/ActionConsole.tsx`,
`v2/overlays/AttackWizard.tsx`. Other `useCommands` callers (e.g. the answer-token
gate in `useV2BattleWatchers`) stay on the raw hook — they dispatch non-`action`
verbs.

Fires for the local player's own actions only — remote players' actions arrive via
socket `applyServerState`, never through a command hook.

Coverage confirmed in the V2 code:
- `ActionConsole.onAction` → `sendCommand("action", {action:key})` and via
  `V2BattleActionsContext` (`openMove`/`openRepair`/`openPrepare`), all dispatching
  `sendCommand("action", …)`.
- `AttackWizard` submit → `sendCommand("action", {action: mode})` for
  `fire`/`aimed`/`lock`.
- **Known gap:** Return-Fire dispatches `sendReact` (`verb:"react"`), so it will
  not bark in v1. Acceptable; revisit if wanted.

### 5. Damage trigger — edit `client/src/v2/hooks/useV2BattleWatchers.tsx`

Add one `useEffect` keyed on `rigs`: compare each rig's total Structure Points to
the previous render (kept in a `useRef<Map<id, number>>`). When any rig's total SP
**drops**, call the mixer with the damage SFX
(`mixer.play([], ["tank_getting_shot_1","tank_getting_shot_2"])`). First render
seeds the baseline without playing; SP increase (repair) never triggers. This rides
the same state stream the existing watchers use.

### 6. Toggle UI — edit `client/src/v2/components/BattleHud.tsx`

Add a mute button to the HUD row. A `useBattleAudio()` hook (in `v2/audio/`, backed
by the mixer's external store via `useSyncExternalStore`) returns `{ on, toggle }`;
the button shows a speaker/mute glyph and calls `toggle()`. Independent of the
narration-TTS toggle so the two never talk over each other.

## Data flow

```
tap action tile
  → ActionConsole.onAction / V2BattleActions / AttackWizard
    → useV2Commands(verb="action", attrs)
        → playAction(attrs.action)
            → actionAudio registry → mixer.play(voices, sfx)
                → soundAssets stem→URL, decode+cache, 2× GainNode, resume ctx
    → shared useCommands POST /command  (unchanged, parallel)

enemy fire resolves → server state → applyServerState
  → rigs SP total drops → useV2BattleWatchers damage effect
      → mixer.play([], tank_getting_shot)
```

## Error handling

- Missing file (stem→`null`): that layer skipped; both null → `play` no-ops.
- `decodeAudioData` / fetch failure: caught, logged once per URL, that clip disabled
  for the session — never throws into React.
- No `AudioContext` support: mixer degrades to a no-op; feature silently off.
- Toggle off: `play()` returns immediately, no fetch/decode.

## Testing

- **`soundAssets`**: `soundUrl` returns a URL for a known stem, `null` for unknown.
- **`actionAudio`**: registry has the expected keys; `playAction` calls the mixer
  with the right stems; unmapped key is a no-op.
- **`audioMixer`** (injected ctx + decode shim): enabled gate; null-stem skip;
  no-immediate-repeat; voice vs sfx gain wiring; suspended→resume; external-store
  subscribe/snapshot; localStorage persistence.
- **`useV2Commands`**: `verb:"action"` triggers `playAction`; other verbs do not;
  still delegates to shared `useCommands`.
- **`useV2BattleWatchers`** damage effect: SP drop → one damage play; first render
  seeds silently; SP increase does not trigger.
- **`BattleHud`**: renders the toggle; clicking flips `useBattleAudio` state.
- `no-v1-imports.test.ts` stays green (all new imports are V2-internal or allowed
  shared logic/assets).
- Existing V2 suites (`ActionConsole`, `AttackWizard`, `V2BattleActionsContext`,
  `BattleHud`, `useV2BattleWatchers`) stay green.

## Scope

**In:** the 10 mapped action keys, damage SFX, layered voice+sfx mix, persisted mute
toggle in the V2 HUD. All code under `client/src/v2/`.

**Out (future):** weapon-ability barks (Harpoon Winch, Rivet Lock, …), Return-Fire
bark, per-rig voice variation, spatial audio, opponent-action audio, TTS fills.
