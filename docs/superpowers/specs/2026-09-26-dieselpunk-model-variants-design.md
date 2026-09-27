# Dieselpunk model variants (client3d)

Date: 2026-09-26
Scope: `client3d/` only. No rules, server, shared state, or V2 UI changes.

## Goal

Give the 3D client varied dieselpunk models **without changing any size**. Today all 14 chassis share one body per weight class (light / medium) and differ only by paint and weapon pair. Walkers and drones share one body each. Set dressing has 6 building kinds and 3 small terrain props.

After this work:
- Every chassis has its own silhouette built from a shared dieselpunk part library.
- Every rig can wear one of 5 skins (service history plus wear).
- Walkers and drones get per-template bodies (Stage 2).
- New buildings and small terrain props join the theme mixes (Stage 3).

"No new sizes" means: same base radius per class (`BASE_RADIUS` in `shared/geometry.js`), same max height and footprint per class as today's models, same terrain footprints and building height range. Enforced by test, not by eye.

## Stages

1. **Rigs**: part library, 14 recipes, 5 skins, skin setting, dev room, tests.
2. **Support units**: 5 walker bodies, 3 drone bodies, same skins.
3. **Set dressing**: 5 building kinds, 5 small terrain variants.

Each stage gets its own implementation plan and lands as its own commit.

---

## Stage 1: Rigs

### Structure

New folder `client3d/src/scene/rig/`:

| File | Role |
|---|---|
| `parts.js` | Part library. Each part is a builder `(ctx) => Group` that reads paint, trim and skin from `ctx` and registers named sockets. |
| `recipes.js` | One entry per chassis codename: `{ legs, feet, torso, head, backpack, shoulders, signature, trim, proportions }`. |
| `skins.js` | The 5 skins: material transform + add-on list per skin. |
| `envelope.js` | Per-class size limits (`light`, `medium`; later `walker`, `drone`), measured once from the pre-change models and then owned as data. |
| `body.js` | `buildRigBody(recipe, skin, ctx)`: assembles parts, applies skin, returns the body contract below. |

`Mech` (`client3d/src/scene/mechs.js`) keeps everything that is not body geometry: base, team ring, facing notch, halo, spent token, crown, animation, heat, spent grey-out, damage (`setParts`), destroy, fade. Its rig constructor path calls `buildRigBody` instead of the inline chest / cockpit / stacks / arms code. Weapon tables (`LR`, `MELEE`) are unchanged and mount on the arm pivots.

### Body contract

`buildRigBody` returns the handles the animation code already uses, so walk / fire / swing / aim / heat / damage keep working untouched:

- `legs`: array of 2 `{ hip, knee, rest: { hip, knee }, height }`
- `pelvis`, `torso`, `chest`, `armR`, `armL`
- `stacks`: at least 1 mesh using `ventMat` (heat glow and smoke attach here)
- `cockpitMat`: dims when spent
- `hipH`
- `sockets`: `back`, `chestFront`, `shoulderL`, `shoulderR`, `hip`, `head`, `shin`

### Part library

- **Torsos (8):** boiler drum, riveted wedge, bomber nose (glazed greenhouse), tractor block (radiator grille front), diving bell, armored cab, zeppelin gondola, vertical boiler.
- **Heads (13):** none (cockpit in chest), gas mask (twin filter snout), visor bucket, locomotive cab, knight helm (slit + crest), diving helm (brass, 3 portholes), welder mask (flip-up plate), periscope, pillbox cupola, stereo rangefinder bar, searchlight dome, observation bubble, coil crown.
- **Backpacks (11):** ammo drum, gas tanks, dynamo (spinning flywheel), twin smokestacks, radiator fins, bellows pump, compressor, shell rack, spark-arrestor chimney, bolt quiver, flare rack. Every backpack carries at least one heat stack.
- **Legs:** light: digitigrade, piston stilt (exposed hydraulics), chicken walker. Medium: pillar, elephant drum, crab knee.
- **Feet (5):** plate, three-toe claw, tracked shoe, drum pad, spur.
- **Shoulders (4):** slab pauldron, rivet cap, exhaust shoulder, hose-fed.
- **Signatures (14):** one per chassis, listed in the recipes.

### Recipes

Light:

| Codename | Weapons | Role | Torso | Head | Legs + feet | Backpack | Signature |
|---|---|---|---|---|---|---|---|
| Gold | Autocannon / Claw | raptor | bomber nose | none | digitigrade + claw | ammo drum | belt-feed chute to the gun |
| Blue | Missile Barrage / Flamethrower | firebug | gondola | gas mask | piston stilt + plate | gas tanks | pilot-light flicker under the chin |
| Purple | Mini Gun / Circular Saw | buzzsaw | tractor block | visor bucket | chicken walker + tracked shoe | dynamo | open flywheel |
| Pumpkin | Double MG / Wrecking Ball | locomotive | boiler drum | loco cab | digitigrade + plate | twin smokestacks | cowcatcher + headlamp |
| Zebra | Arc Gun / Sword | duelist | riveted wedge | knight helm | piston stilt + spur | radiator fins | back scabbard + crest pennant |
| Turquoise | Harpoon / Anchor | diver | diving bell | diving helm | chicken walker + drum pad | bellows pump | hip chain winch |
| Green | Rivet Gun / Pressure Claw | shipwright | armored cab | welder mask | digitigrade + tracked shoe | compressor | rivet hoppers on shoulders |

Medium:

| Codename | Weapons | Role | Torso | Head | Legs + feet | Backpack | Signature |
|---|---|---|---|---|---|---|---|
| Copper | Mortar / Lance | artillery | tractor block | periscope | elephant drum + drum pad | shell rack | brass aiming quadrant |
| Black | Siege Maul / Bulwark Shield | bulwark | riveted wedge | pillbox cupola | pillar + plate | spark chimney | hip armor skirts |
| Red | Sniper Cannon / Chainsaw | marksman | armored cab | stereo rangefinder | crab knee + spur | radiator fins | chainsaw fuel can on hip |
| Silver | Crossbow / Talon | shrike | bomber nose | searchlight dome | crab knee + claw | bolt quiver | talon spurs |
| Brass | Steam Cannon / Piston Hammer | steamworks | vertical boiler | none (gauge faces on chest) | pillar + tracked shoe | tall twin stacks | safety-valve whistle that puffs on fire |
| Ivory | Flare Launcher / Bayonet | signaller | gondola | observation bubble | elephant drum + plate | flare rack | signal mast with pennants |
| Jade | Tesla Coil / Shock Glove | electrician | diving bell | coil crown | crab knee + drum pad | dynamo | ceramic insulator rings on arms |

Shoulder and trim metal (brass / steel / gunmetal) are chosen per recipe during implementation to maximize contrast between neighbours in the same class.

### Variety rules

- Within a class, no two chassis share a torso, head, or backpack.
- Within a class, the leg + foot combo is unique.
- Torsos reused across classes get different proportions, heads, legs and backpacks.
- Each signature belongs to exactly one chassis.
- Per-recipe proportion knobs: stance width, torso scale (x/y/z), leg ratio, forward hunch. Free to vary as long as the envelope test passes.

### Skins

A skin is:
1. A **material transform** on paint and trim: color shift, roughness, metalness, optional canvas overlay (grime, rust, stencils, nose art).
2. **Add-ons** bolted to sockets. Placement is seeded from rig id, so two rigs in the same skin do not look identical.

| Skin | Materials | Add-ons |
|---|---|---|
| Factory Fresh | glossy enamel, polished trim, white stencilled serial on chest, clean glass | none (baseline) |
| Field Refit | paint faded and flat, mud gradient up to the knees | sandbags on hip, spare track links on chest, rolled tarp on back, jerry cans, lashed crate |
| Ace | deep lacquer, chrome trim, nose art panel on chest, kill-tally stripes on shoulder, checkered arm band | pennant on back, red-tipped stacks, chrome headlamp ring |
| Battle-Worn (damaged) | paint darkened, scorch halos, bullet pocks | welded patch plates in an odd color, one shoulder plate missing, bent stack, sparking cable stub, strap on one leg |
| Rust Bucket (dirty) | rust bloom, oil streaks down from the stacks, mismatched primer-red and grey panels, soot-black stack tops | wire-lashed repairs, dangling chain, tin-can mufflers, cracked glass |

Interaction with existing systems:
- Battle damage (`setParts` charring), spent grey-out, destroy and fade already clone materials, so they layer on top of any skin.
- Zebra's stripe canvas becomes the base paint; the skin overlay composites over it.
- Skin materials are cached per `(chassis, skin)`.
- Without a canvas (node tests), overlay textures are skipped; geometry and add-ons are still built, so the envelope test covers every add-on.

### Skin setting

`client3d/src/settings.js` gets a `rigSkins` setting (per browser, no server state):
- **By side** (default): side A Factory Fresh, side B Field Refit. Teams read apart by finish as well as ring color.
- **Fixed**: one skin for every rig.
- **Per chassis**: codename to skin map.
- **Random per battle**: seeded from room id.

Picker lives in the client3d settings panel with a small 3D preview of the selected chassis.

### Dev room

- Chassis row becomes a 14 x 5 grid: every chassis in every skin, labelled and deep-linkable (`#dev=rig-<Codename>-<skin>`).
- New Parts row: every torso, head, backpack, leg set, foot, shoulder and signature on its own pedestal.
- Card shows recipe, skin, and measured size vs envelope (green inside, red over).

### Tests (`node --test`)

client3d has no tests and vitest only globs `client/**`. Add `client3d/**/*.test.js` to the `node --test` globs in root `package.json`. Three builds geometry in node without a DOM.

- **Envelope:** every chassis x skin, after `baseScale`, fits its class height and footprint from `envelope.js`.
- **Contract:** every built body exposes the full body contract including all 7 sockets and `stacks.length >= 1`.
- **Variety:** the variety rules above; every `CHASSIS` codename in `shared/game-state.js` has a recipe.
- **Skins:** each skin applies to each chassis without throwing; seeded add-on layout differs between two rig ids.
- No pinned dimension numbers in tests. Tests compare against `envelope.js`.

`package.json` may be dirty from another agent; only the `test` script line is touched.

---

## Stage 2: Support units

Same part system and skins, walker / drone envelopes from `envelope.js`. The `buildSupport` path in `Mech` switches to `buildRigBody` with support recipes; same body contract.

Walkers (one body per `SUPPORT_TEMPLATES` walker):
- **radiator**: finned heat-sink barrel pod.
- **field-welder**: gas-bottle cart pod with arc hood.
- **medic**: white-cross ambulance cab with stretcher rack.
- **rocket**: rail rack pod.
- **gun**: armored ball turret.

Drones (one body per `DRONE_TYPES` entry):
- **hunter**: low wedge on beetle legs.
- **sapper**: squat charge-barrel crab.
- **spotter**: tall mast eye on spidery legs.

Tanks still have no 3D model; out of scope.

## Stage 3: Set dressing

Existing footprints (terrain rect `t.w x t.h`) and existing building height range only.

- New `BUILDINGS` kinds in `props.js`: pump house, gas holder (telescoping drum), signal box (raised rail cabin), radio pylon, concrete pillbox. Added to the theme building mixes in `themes.js`.
- Small terrain variants in the existing barricade / crate / rubble slots: sandbag wall, fuel drum cluster, czech-hedgehog tank traps, cable spools, wrecked rig carcass (rubble variant built from Stage 1 parts).
- Envelope test extended: each new kind fits its terrain rect and the building height range.

## Out of scope

- Any gameplay, rules, or server change.
- V1 or V2 web UI.
- Tank 3D models.
- New base sizes or weight classes.
