# In-Drawer Reload — design

Date: 2026-07-12
Branch: frontend/v2-redesign

## Problem

When a Rig's ranged weapon is spent, the V2 Fire drawer lets the player select the
spent long-range weapon and then dead-ends: the primary CTA turns into a disabled
**"Reload first"** button that does nothing. Reload is only actually performed from a
separate tile in the console's Attack group. The drawer tells you what's wrong but
gives you no way to fix it in place.

We want the Fire drawer to own reloading: disable the spent weapon in the picker, and
offer a live **Reload** button that arms the weapon so the player can fire again
without leaving the drawer.

## Decisions (agreed)

1. **Reload flow:** tapping Reload in the drawer reloads *and stays open*, re-arming the
   long-range weapon so the player can immediately fire it if they still have an action.
2. **Single reload path (true drawer-only):** the standalone Reload tile in the console
   Attack group is removed. The Fire drawer is the only place reload is surfaced. To keep
   this reachable for units with no melee fallback, the Fire tile stays enabled whenever
   the ranged weapon is spent-but-reloadable (it opens a drawer that offers Reload).
3. **Reload cost — RULE CHANGE:** reload no longer spends an action. Instead:
   - **Heat kinds (Rigs):** reload costs **0 actions** and rolls a **d6 for heat** —
     `1-3 → +2 heat`, `4-6 → +1 heat`. Low rolls bite harder.
   - **Cold kinds (Tank/Walker, no heat track):** can't be charged heat, so they keep the
     old price — **1 action, 0 heat**.
   This turns reload into a heat gamble rather than a tempo tax. Sustained ranged fire
   (fire → reload → fire …) is now limited by the action budget of the *shots* plus the
   heat the reloads pile on.
4. **Second-shot heat still applies:** the post-reload shot is the activation's second
   ranged shot, so it also runs `+1 heat` (existing rule — `reload` doesn't reset
   `turn.longRangeShots`). So a reload-then-fire stacks the reload roll (+1/+2) *and* the
   second-shot surcharge (+1). The drawer surfaces both honestly.

## Spent-signal unification (prerequisite)

The authoritative fire resolution is `shared/combat.js` `resolveAttack`: a Rig's long-range
shot clears `loaded.longRange` (combat.js:383) and a flat-pick cold-kind "unit" weapon clears
`loaded.unit` (combat.js:384). Each kind only ever writes its own slot — a Rig never gets a
`loaded.unit` key, and a flat-pick never gets `loaded.longRange` set false.

**Spent check:** detect a spent ranged weapon on **either** slot — `loaded.longRange === false
|| loaded.unit === false`. Because the two slots are mutually exclusive by kind, this single
OR is exact for both Rigs and cold kinds; it needs no `weaponMode` branch. Use it in
`battle-view.js` `availableActions` and in the drawer's spent computation. (An earlier draft
proposed collapsing to `loaded.longRange` only — that is wrong: it never trips for flat-pick
kinds, which clear `loaded.unit`.)

The `reload` verb (server branch below) arms `loaded = { longRange: true, melee: true }`;
replacing the object drops any stale `unit: false` key, so a reloaded flat-pick reads as
armed (`loaded.unit` becomes `undefined`, not `false`).

## Behavior

Scope: `mode === "fire"`, non-react. (`aimed` never opens while spent; react uses a
separate path.)

**Spent state (`liveRig.loaded.longRange === false || liveRig.loaded.unit === false`):**

- **Weapon picker:** the long-range chip renders disabled + greyed with a `Spent · reload`
  sub-label; it can't be selected. The drawer keeps auto-opening on the melee weapon (existing
  behavior), so a melee strike stays fully usable.
- **Reload affordance** (label reflects the cost by kind):
  - Heat kind: `⟳ Reload · +1–2 heat` — always enabled when spent (heat has no budget gate;
    overheating is allowed and is the whole risk).
  - Cold kind: `⟳ Reload · 1 action` — disabled with a `Need 1 action` note when no actions
    remain.
  - If a live weapon is selectable (melee present): a reload banner sits under the Weapon
    field — *"Ranged weapon spent — Reload is mandatory before it can fire again."* plus the
    cost line — with the `⟳ Reload` button. The bottom CTA stays the melee Fire.
  - If no live weapon (no/destroyed melee, or flat-pick with only the spent ranged weapon):
    the big ember CTA itself becomes the `⟳ Reload`.

**Tapping Reload:**

- Manual-dice mode (`game.autoResolve === false`) on a heat kind: `promptDice` a single d6
  for the reload heat roll and pass it as `a.dice.reload` (mirrors Repair's `a.dice.repair`).
  Cold kinds and auto-resolve skip the prompt.
- Dispatch `sendCommand("action", { name: rig.name, action: "reload"[, dice] })`.
- Optimistically flip local `justReloaded = true` for instant feedback; the authoritative
  server echo (via live-rig derivation below) confirms it.
- Re-enable the long-range chip and **auto-select it** (`patch({ weapon: "longRange" })`),
  which re-seeds the range slider to the weapon's sweet spot via the existing weapon-change
  effect. Banner disappears; bottom CTA becomes the long-range Fire (still noting the
  `+1 second-shot heat`, or `Need 1 action · N left` if out of budget).

## Reactivity

The drawer currently reads a `rig` prop snapshot taken at open time, so a reload echo
wouldn't show. Derive the live rig from room state:

```
const liveRig = rigs.find((r) => r.id === rig.id) ?? rig;
```

Use `liveRig.loaded` for the spent check. Combined with the optimistic `justReloaded`
flag, the drawer reflects the reload instantly and stays consistent with the server:

```
const spent = (liveRig.loaded?.longRange === false || liveRig.loaded?.unit === false) && !justReloaded;
```

## Server reload branch

The `act === "reload"` handler in `game-state.js` currently falls through to the generic
tail (`bumpHeat(def.heat)` + `t.actionsUsed += 1`). Give it its own branch that returns
early with the new cost model:

```
if (act === "reload") {
  rig.loaded = { longRange: true, melee: true }; // loaded.longRange is the one spent flag
  const heatKind = !!UNIT_KINDS[kindOf(rig)].hasHeat;
  let roll = 0, heat = 0;
  if (heatKind) {
    roll = rollD(6, a.dice?.reload, random);
    heat = roll <= 3 ? 2 : 1;   // 1-3 → +2, 4-6 → +1
    bumpHeat(rig, heat);
  } else {
    t.actionsUsed += 1;         // heatless kinds pay an action instead
  }
  pushResolution(room, {
    kind: "reload", actor: rig.owner, rigId: rig.id,
    rolls: heatKind ? [{ sides: 6, value: roll, label: "D6" }] : [],
    summary: heatKind
      ? `${rig.name} reloads — rolled ${roll} → +${heat} heat`
      : `${rig.name} reloads (1 action)`,
    effects: [],
  });
  return true;
}
```

Heat kinds must be exempt from any generic "no actions left" gate at the top of the action
handler (reload is free for them). Confirm and adjust that gate so a 0-action heat kind can
still reload.

`rules.js`: `ACTIONS.reload` keeps its entry for the label, but its `heat`/`slot` are no
longer authoritative for reload — the branch above owns the cost. Leave a comment noting so.

`rules.md`: update §7 (reload) to the new cost model.

## Console changes (true drawer-only)

- `shared/battle-view.js`:
  - Remove `"reload"` from `ACTION_ORDER` so `availableActions` no longer emits it.
  - Unify `rangedSpent` to `rig.loaded?.longRange === false` (drop the flat-pick `loaded.unit`
    branch).
  - In the fire/aimed gating: when `rangedSpent`, keep `fire` enabled (it opens the reload
    drawer) and disable only `aimed`.
- `client/src/v2/battle/ActionConsole.tsx`: drop `"reload"` from the Attack group's `keys`
  and its `ACTION_GLYPH` entry. With `reload` gone from `availableActions` and `aimed`
  disabled while spent, the Attack group collapses to a solo `fire` tile that taps straight
  into the drawer.

The `reload` verb in `game-state.js` (rewritten per **Server reload branch**) and
`ACTIONS.reload` in `rules.js` stay — the drawer dispatches the action directly.

## Components / units

- **`Field`** (in `AttackWizard.tsx`): extend with an optional `optDisabled?: (opt) => boolean`
  predicate. A disabled option renders as a non-interactive greyed chip. Single, focused
  change to an existing presentational unit.
- **`AttackWizard`**: live-rig derivation, `justReloaded` state, the reload banner/CTA,
  weapon-picker disabling, and CTA adaptation. Reload dispatch reuses the existing
  `sendCommand` path.

## Files

- `shared/game-state.js` — dedicated `reload` branch: arm all slots; heat kinds roll d6
  (1-3→+2, 4-6→+1 heat), 0 actions; cold kinds 1 action, 0 heat; free-reload exempt from
  the no-actions gate. Unify spend/gate reads on `loaded.longRange`.
- `shared/game-state.test.js` — reload heat roll + no action cost (heat kinds); cold-kind
  reload costs 1 action; reload arms the weapon.
- `shared/rules.js` — comment that `ACTIONS.reload` heat/slot are non-authoritative.
- `shared/battle-view.js` — spent-signal unification (`loaded.longRange`); drop `reload`
  from `ACTION_ORDER`; keep `fire` enabled while spent, disable `aimed`.
- `shared/battle-view.test.js` — reload no longer listed; fire enabled when spent; flat-pick
  spent now registers.
- `rules.md` — §7 reload: new cost model (free action + d6 heat; cold kinds 1 action).
- `client/src/v2/battle/ActionConsole.tsx` — remove reload from Attack group + glyph map.
- `client/src/v2/battle/ActionConsole.test.tsx` — drop reload-tile assertions if present.
- `client/src/v2/overlays/AttackWizard.tsx` — `Field` `optDisabled`; live rig; `justReloaded`;
  reload banner/CTA (heat vs action label by kind); manual-dice reload prompt; picker
  disabling; spent check on `loaded.longRange`.
- `client/src/v2/overlays/AttackWizard.test.tsx` — spent → long-range chip disabled + banner;
  tap Reload → dispatches `reload`, long-range armed + auto-selected; heat-kind reload has no
  action gate; cold-kind reload gated on actions; no-melee → CTA is Reload.
- `client/src/v2/styles/wizards.css` — disabled weapon chip + reload banner/button (ember tone).

## Testing

- **Server** — heat kind: `reload` arms the weapon, spends 0 actions, and adds +2 heat on a
  d6 of 1-3 / +1 on 4-6 (seed the die via `a.dice.reload`). Cold kind: `reload` arms the
  weapon, spends 1 action, adds 0 heat. Heat-kind reload works at 0 actions left.
- **Drawer** — Rig, long-range spent, melee present: long-range chip disabled (`Spent ·
  reload`); banner shown; reload button reads `+1–2 heat`; bottom CTA is melee Fire.
- Tap Reload → dispatches `action: reload`; after flip, long-range chip enabled + selected,
  banner gone, CTA is long-range Fire.
- Rig, long-range spent, no melee: big CTA is `⟳ Reload`; after reload it flips to Fire.
- Cold kind, spent, 0 actions: reload disabled with `Need 1 action`.
- **battle-view** — flat-pick spent registers as `rangedSpent`; `fire` stays enabled while
  spent; `aimed` disabled; `reload` absent from the action list.

## Out of scope

- Reload for the react / Return-Fire path (separate flow; untouched).
- Aimed-shot reload entry (must reload via the Fire drawer first, then re-open Aimed).
