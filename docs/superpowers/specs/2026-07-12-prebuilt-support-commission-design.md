# Pre-built Tank & Walker Commissioning — Design

**Date:** 2026-07-12
**Branch:** `frontend/v2-redesign`
**Status:** Approved, ready for implementation plan

## Problem

Tanks and Walkers are commissioned in `CommissionWizard.tsx` by flat-picking a
single weapon from `UNIT_WEAPONS`. This treats them as bare "models" and ignores
the shipped support-unit system (a Tank/Walker carries two distinct modules —
Damage / Repair / Coolant / Recon — where Damage grants a real gun and the other
three grant ally-targeting verbs; sidearm fills in when there is no Damage
module). The wizard never lets a player choose modules, so every commissioned
Tank/Walker is a naked weapon with no support identity.

Rigs already commission the right way: the player picks one **pre-built chassis**
card (weapons + weight class fixed by the frame) rather than assembling parts.
Tanks and Walkers should mirror this — pick one **pre-built template** that
encapsulates the whole damage + support loadout, no per-weapon selection.

## Goals

- Commission a Tank/Walker by picking a named pre-built template, exactly the way
  a Rig picks a chassis.
- A template fully encapsulates the unit: kind, gun (or Sidearm), and its two
  modules.
- No combat or server-logic changes — the `add` verb already accepts `modules`
  and `unit`.

## Non-goals

- No new module types, weapons, or combat rules.
- No changes to how modules resolve in battle.
- No custom/free-build path for Tanks/Walkers (pre-built only, matching Rigs).

## Design

### 1. Data layer — `shared/game-state.js`

Introduce one owner-neutral catalog as the single source of truth:

```js
export const SUPPORT_TEMPLATES = [
  { id: "marksman-tank",   name: "Marksman Tank",   kind: "tank",   unit: "Tank Cannon",      modules: ["damage", "recon"] },
  { id: "depot-tank",      name: "Depot Tank",      kind: "tank",   unit: null,               modules: ["repair", "coolant"] },
  { id: "radiator-walker", name: "Radiator Walker", kind: "walker", unit: "Coaxial MG",       modules: ["damage", "coolant"] },
  { id: "field-welder",    name: "Field Welder",    kind: "walker", unit: null,               modules: ["repair", "recon"] },
  { id: "medic-walker",    name: "Medic Walker",    kind: "walker", unit: null,               modules: ["repair", "recon"] },
  { id: "rocket-walker",   name: "Rocket Walker",   kind: "walker", unit: "Rocket Pod",       modules: ["damage", "recon"] },
  { id: "gun-walker",      name: "Gun Walker",      kind: "walker", unit: "Autocannon Mount", modules: ["damage", "coolant"] },
];
```

- `unit: null` means sidearm-only (a Repair/Coolant/Recon-only unit). The
  expander omits `unit` entirely for these so `makeUnit` fits the Sidearm.
- Twins `field-welder` and `medic-walker` share a loadout (walker /
  repair+recon / sidearm) but are distinct named identities. Both stay — they
  are harmless flavor variants and are needed to rebuild the existing rosters
  without renaming shipped units.

Rebuild the two owner-tagged rosters from the catalog with a small expander:

```js
function templ(id, owner) {
  const t = SUPPORT_TEMPLATES.find((x) => x.id === id);
  const out = { name: t.name, owner, kind: t.kind, modules: t.modules };
  if (t.unit) out.unit = t.unit; // omit when sidearm-only — matches prior literals
  return out;
}

export const SUPPORT_UNITS = [
  templ("marksman-tank", "a"), templ("radiator-walker", "a"),
  templ("field-welder", "b"),  templ("depot-tank", "b"),
];

export const SEED_SUPPORT = [
  templ("marksman-tank", "a"), templ("radiator-walker", "a"), templ("medic-walker", "a"),
  templ("depot-tank", "b"),    templ("rocket-walker", "b"),   templ("gun-walker", "b"),
];
```

The produced arrays are deep-equal to today's hand-written literals, so all
existing consumers and tests are unaffected.

Add lookups next to the catalog:

```js
export function templateById(id) { /* case-insensitive find, or null */ }
export function templatesForKind(kind) { /* SUPPORT_TEMPLATES filtered by kind */ }
```

### 2. Wizard — `client/src/v2/overlays/CommissionWizard.tsx`

- `stepsFor("tank"|"walker")` → `["Kind", "Loadout", "Confirm"]`. The Kind step
  stays the current 3-way rig/tank/walker selector, unchanged.
- Replace `WizardState.unit` (a `UNIT_WEAPONS` key) with `WizardState.template`
  (a `SUPPORT_TEMPLATES` id). Initial value = first template of the current kind.
- Selecting the Kind card for tank/walker sets `template` to the first template
  of that kind (mirrors how selecting Rig chassis-defaults the loadout).
- **Loadout step (step 1, tank/walker):** render `templatesForKind(state.kind)`
  as a card grid. Each card shows:
  - template name (title),
  - gun line: `weaponGlyph(unit) + name + STR/ROF/range` from `UNIT_WEAPONS`, or
    a "Sidearm — light plinker" line when `unit` is null,
  - two module chips, each label + one-line blurb.
  - Reuses the rig chassis card visual family (`v2-fc-card`/`v2-fc-slot`), minus
    the upgrade bay. No new CSS system; extend `forge.css` with a compact module
    chip if needed.
- **Confirm step (step 2, tank/walker):** name + kind + gun line + module lines,
  read from the selected template.
- `unitName()` for tank/walker returns the template name.
- `submit()` for tank/walker sends:
  ```js
  sendCommand("add", {
    name: template.name,
    kind: state.kind,
    owner: state.owner,
    unit: template.unit ?? undefined, // omit → server fits Sidearm
    modules: template.modules,
  });
  ```
- Delete the old `UNIT_WEAPONS` flat-pick grid (step 1) and its confirm branch.
  Keep the `UNIT_WEAPONS` import only for rendering gun stats on the cards.

### 3. Module blurbs — `client/src/v2/lib/commissionData.ts`

Add a small map for the loadout cards (Damage is represented by the gun itself,
so it needs no blurb):

```ts
export const MODULE_BLURB: Record<string, string> = {
  repair:  "Field Weld — heal an ally/self ≤2\".",
  coolant: "Vent — cool a friendly Rig ≤2\" by 2 heat.",
  recon:   "Paint — mark an enemy; allies ignore its cover, +1 Aim.",
};
```

## Data flow

Kind step → sets `template` to first of kind → Loadout step patches `template` on
card click → Confirm reads the template → `submit` forwards `unit` + `modules` to
the existing `add` verb → `makeUnit(kind, …, { unit, modules })` builds the unit
exactly as the seed path already does.

## Error handling / edge cases

- Sidearm-only template: `unit` omitted from the `add` payload; `makeUnit` fits
  Sidearm (already the behavior for `SUPPORT_UNITS` sidearm entries).
- Name collisions on commit (e.g. commissioning a "Marksman Tank" when a seeded
  one exists): handled by the server's existing dedupe on `add`.
- Unknown/empty template id: `templateById` returns null; the wizard guards by
  always defaulting `template` to a valid id on kind change, so the confirm/submit
  path never sees null.

## Testing

- **`shared/game-state.test.js`**: assert `SUPPORT_UNITS` and `SEED_SUPPORT` are
  deep-equal to their pre-refactor values (guards the rebuild); assert
  `templatesForKind`/`templateById` behavior; assert `makeUnit` built from a
  template's add-shape carries the right `modules` and weapon (gun vs Sidearm).
- **Browser verification**: commission a Marksman Tank and a Field Welder through
  the wizard; confirm the roster shows the gun + module chips and that a
  sidearm-only template deploys with the Sidearm.

## Files touched

- `shared/game-state.js` — add `SUPPORT_TEMPLATES` + lookups; rebuild
  `SUPPORT_UNITS` / `SEED_SUPPORT`.
- `client/src/v2/overlays/CommissionWizard.tsx` — template state + Loadout card
  grid + submit rewire; remove flat-pick grid.
- `client/src/v2/lib/commissionData.ts` — `MODULE_BLURB`.
- `client/src/v2/styles/forge.css` — module chip styling if needed.
- `shared/game-state.test.js` — coverage above.
