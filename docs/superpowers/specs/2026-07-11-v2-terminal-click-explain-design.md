# V2 Rig Terminal — click-to-explain for every info token

**Date:** 2026-07-11
**Status:** Design approved, pending spec review

## Goal

Every *informational* element in the V2 Rig Terminal pops a definition when
clicked, exactly like glossary words already do in chat. The trigger was the
runtime modifier chips (`.v2-rt-mods`), but the ask is broader: mods, status,
component rows, heat gauge, and loadout stats should all be tappable.

## Scope

**In:** informational tokens rendered inside `RigTerminal` and its children
(`CompRow`, `HeatGauge`, `LoadoutView`) plus the two view-model producers that
feed it (`rigModifiers`, `rigStatus`).

**Out (controls):** buttons whose click performs an action —
`ActionConsole` tiles and sub-actions, the Activate button, the ±damage/repair
steppers, the Status/Loadout tabs, and the close button. A control cannot also
be click-to-explain without hijacking its action. Excluded by decision.

**Defs live in `GLOSSARY`** (`shared/glossary.js`) — one source of truth, reused
by the existing tip. No parallel def store.

## Mechanism

### Reuse the existing tip — no context change

`useV2GlossaryTip().showTip(id, anchorEl)` already:
- resolves `glossaryById(id)`; no-ops if the id is unknown,
- portals `GlossaryTip` to `<body>`, positions above/below the anchor, clamps to
  the viewport, points the arrow, and
- toggles `is-open` on the anchor element.

Nothing about the tip is glossary-text-specific. We drive it directly from
structured UI.

### New: `InfoTerm` wrapper

`client/src/v2/components/InfoTerm.tsx`

```tsx
interface Props {
  id?: string;                 // glossary id; falsy or unknown → plain passthrough
  as?: keyof JSX.IntrinsicElements;  // default "span"
  className?: string;
  children: ReactNode;
}
```

Behaviour:
- If `id` is falsy **or** `glossaryById(id)` is undefined, render
  `<Tag className={className}>{children}</Tag>` with **no** affordance — an
  unmapped token must not look clickable.
- Otherwise render the tag with `className = "v2-info " + className`,
  `role="button"`, `tabIndex={0}`, `aria-label={term + " — what this means"}`,
  `onClick={e => showTip(id, e.currentTarget)}`, and an `onKeyDown` that fires
  `showTip` on Enter/Space (preventDefault). Mirrors `GlossaryText`'s handlers.

This is the single reusable primitive; every wiring site below spreads it.

### New export: `matchGlossary`

`client/src/lib/glossaryTerms.ts` already builds an internal `byMatch` map.
Add:

```ts
export function matchGlossary(text: string): string | undefined;
```

Returns the glossary id whose `match` array contains an exact `text`
(longest-first is irrelevant for exact lookup — it's a direct map get). Used to
resolve weapon perks and weapon type labels to ids without re-tokenising.

### CSS: `.v2-info`

New block in `client/src/v2/styles/glossary.css`, scoped under `.v2-root`. A
*subtle* affordance that layers onto whatever the host element already looks
like (chips, stat labels, part labels) rather than restyling it:
- `cursor: pointer`
- hover/focus-visible: faint `--v2-oil` tint background + dotted underline
- `.v2-info.is-open`: slightly stronger tint (matches how `.v2-gloss-term.is-open`
  reads)

It must not fight `.v2-rt-mod` tones or `.v2-comp-label` layout — additive only.

## Glossary additions (`shared/glossary.js`)

Fold in defs for everything not already covered. Each entry keeps the existing
shape `{ id, term, match, def }`. `match` is required by the schema but these
ids are looked up directly (not via text tokenising), so `match` can be a single
canonical string; it still lets the same terms highlight in chat for free.

New entries, grouped:

**Runtime states** (mod chips) — ids and the mod they back:
`immobilised, pinned, emplaced, barrage, engaged, burning, no-cooling,
speed-halved, skip-activation, momentum, missiles-locked, action-penalty,
no-prepare, anchored, no-actives, arc-locked, arms-suppressed, belt-cycling,
cracked, riveted, no-repair, reaction-set, braced, evasive, return-fire,
weapon-lost, ranged-unloaded, painted`

Def text is drawn from `rules.md` / existing mechanics (each state already has a
tag describing its effect; the def expands the "why/when"). The `structPart 0 /
powerPart 0 / mobPart 0` catastrophic mods do **not** get new entries — they
point at the existing `hull` / `engine` / `legs` entries, whose defs already
state the 0-SP effect.

**Status chip** (`rigStatus`): `destroyed, heavy-damage, damaged, nominal`.
The catastrophic case reuses the existing `catastrophic-damage` entry.

**Non-rig parts**: `tracks, turret, mount` (rig's hull/arms/legs/engine already
exist). Mirror the rig-part defs, worded for tank/walker.

**Modules**: `damage, repair, coolant, recon` — one line each on what the module
grants (from the Support Units spec). Note: keep the ids namespaced if a bare
`repair`/`damage` id would collide with an existing entry — check before adding;
prefer `module-damage` etc. if so. (`repair` already exists as the action;
`damage` does not. Use `module-repair`, `module-coolant`, `module-recon`,
`module-damage` for safety and consistency.)

## Wiring

Each site adds an *id pointer* and wraps the token in `InfoTerm`. Sites with no
known id degrade to plain text via the guard.

### 1. `rigModifiers` (`shared/battle-view.js`)
Add a `gloss` string to every pushed mod object. Static ids for the dynamic
per-location mods:
- `${struct}0` → `hull` (rig) / `hull` for other structural parts' names via a
  small role→id fallback; simplest: point structural-0 to the structural part's
  own id (`hull`), power-0 to `engine`, mobility-0 to `legs`/`tracks`.
  Concretely: use the part name as the id when it's a known glossary part id,
  else fall back by role.
- `crack-${loc}` → `cracked`; `rivet-${loc}` → `riveted`;
  `norepair-${loc}` → `no-repair`; `weapon` → `weapon-lost`.
- Reaction `prep` mod → `reaction-set` when hidden, else `braced` / `evasive` /
  `return-fire` by `prepLabel(type)`.
- All the rest map 1:1 to the ids listed above.

**Tests:** `shared/battle-view.test.js` asserts the shape of `rigModifiers`
output. Update expected objects to include `gloss`.

### 2. `rigStatus` (`client/src/lib/rigView.ts`)
Add `gloss` to the returned object: `destroyed` → `destroyed`, catastrophic →
`catastrophic-damage`, heavy → `heavy-damage`, damaged → `damaged`, nominal →
`nominal`. Update any `rigView` test that snapshots the return.

### 3. `RigTerminal` (`client/src/v2/overlays/RigTerminal.tsx`)
- Mod chips: wrap each `<span class="v2-rt-mod">` in `InfoTerm as="span"
  id={mod.gloss}` (keep the existing class + `data-tone`).
- Status chip: wrap in `InfoTerm id={st.gloss}`.
- Header `badge` (weight class): `InfoTerm id="weight-class"`.
- Loadout summary text terms in the sub-line: leave as-is (it's a derived
  string, not a token) — the loadout view proper carries the tappable stats.

### 4. `CompRow` (`client/src/v2/components/CompRow.tsx`)
Wrap `v2-comp-label` in `InfoTerm`, id from a `PART_GLOSS` map:
`{ hull, arms, legs, engine, tracks, turret, mount }` (identity map — each part
name is its glossary id). Unknown parts pass through plain.

### 5. `HeatGauge` (`client/src/v2/components/HeatGauge.tsx`)
- "ENGINE HEAT" label → `InfoTerm id="heat"`.
- The `/{m.cap}` read → `InfoTerm id="heat-capacity"` (wrap just the cap, or the
  whole read pointing at heat-capacity — wrap the cap number).

### 6. `LoadoutView` (`client/src/v2/components/LoadoutView.tsx`)
- `Stat` label (`ROF`/`STR`) → `InfoTerm id={label.toLowerCase()}` (`rof`,
  `str`). The range label: `RNG`/`RANGE` → id `rng`.
- Perk chips (`v2-rt-lo-perk`, both base and added): `InfoTerm
  id={matchGlossary(perk)}`.
- Module chips: `InfoTerm id={"module-" + m}` (m ∈ damage/repair/coolant/recon).
- Weapon type / name: leave name plain; no glossary id for a proper weapon name.
  (Sidearm tag → optional, low value; skip.)

## Testing

- **`InfoTerm`** unit test (`InfoTerm.test.tsx`): known id → renders button role,
  Enter/click calls `showTip`; unknown/absent id → renders plain span, no
  `role`, no `v2-info` class.
- **`matchGlossary`** test in `glossaryTerms.test.ts`: exact perk → id; unknown →
  undefined; case-sensitive per existing glossary rules.
- **`rigModifiers`** test update: every mod carries a `gloss` that resolves to a
  real glossary id. Add an assertion iterating all mods for a fixture rig and
  checking `glossaryById(mod.gloss)` is defined — guards against typos and
  future mods added without a def.
- **`rigStatus`** test update for the new `gloss` field.
- **Coverage guard:** a test that, for a fixture rig exercising many states,
  asserts every rendered `.v2-rt-mod` / status / part / stat token that carries
  an id resolves to a def. (Lightweight — render `RigTerminal`, query
  `[data-info]` or `.v2-info`, assert each resolves.)

## Non-goals

- No changes to the glossary tip component, positioning, or context API.
- No tips on action controls (excluded).
- No new "browse all runtime states" dialog — the existing GlossaryDialog will
  simply grow because the new entries are ordinary glossary entries. (Acceptable;
  if it becomes noisy, a `category` field can hide runtime states from browse —
  out of scope here.)

## Open risks

- Glossary id collisions (`repair`, `damage`) — resolved by namespacing modules
  `module-*`. Verify no other new id clashes before adding.
- Adding runtime states to `GLOSSARY` means they now also highlight in chat text
  (via `tokenizeGlossary`). Words like "Engaged", "Painted", "Burning" could
  match prose unexpectedly. Mitigation: keep `match` arrays tight (exact tags,
  capitalised) or, if noisy, give runtime entries an empty `match` and rely only
  on direct id lookup. Decide during implementation.
