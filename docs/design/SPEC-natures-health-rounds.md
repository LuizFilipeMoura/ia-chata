# Spec — Upgrade Natures · Per-Rig Health · 10-Round Cap

One umbrella change with three parts. Build in the phase order below; Phases 1–3 are quick, safe, and unblock longer playtests immediately, then the nature plumbing, then the new mechanics one at a time.

Reference: per-rig upgrade details live in the eight `docs/design/<rig-id>.md` files. Constraints in [AGENTS.md](../../AGENTS.md): weapons globally unique, one rig per field (no mirror matchups), **no new battlefield/spatial mechanics** (grandfathered spatial ones noted below), upgrade natures = Field / Tuned / Prototype, **max one Prototype per rig**.

---

## Phase 1 — Round cap 5 → 10

- `shared/game-state.js`: add `export const MAX_ROUNDS = 10;`. Replace the magic `5` at `advanceRound` (`room.game.round >= 5` → `>= MAX_ROUNDS`). Update the comment at ~1154.
- Copy sync "5 rounds" → "10 rounds": `rules.md` (2 spots, §11 + victory), `server/prompt.js` (~128), `shared/glossary.js` (2 defs).
- Test: `shared/game-state.test.js:864` "after round 5 the higher VP wins" → drive to round 10.
- Leave the "quicker game uses 4" note in rules.md as an optional variant, or drop it — maintainer's call.

## Phase 2 — Per-rig health (new SP data axis)

Rigs currently derive SP from `RIG_DEFAULTS[class]`. Make SP **per prebuilt** so durability expresses identity. SP lives in `PREBUILT_RIGS` (code-authoritative, same as weapons/class — NOT in `content/prebuilts.json`).

New per-rig SP (≈1.8–2.2× old; tiers: Bulwark > Durable > Standard > Glass):

| Rig | Hull | Arms | Legs | Engine | Total |
|---|---|---|---|---|---|
| medium-shield-siege | 16 | 13 | 12 | 11 | 52 |
| medium-lance-mortar | 14 | 12 | 12 | 10 | 48 |
| medium-sniper-chainsaw | 12 | 11 | 11 | 9 | 43 |
| light-claw-autocannon | 13 | 11 | 11 | 9 | 44 |
| light-saw-minigun | 13 | 11 | 11 | 9 | 44 |
| light-wreckingball-double | 12 | 10 | 11 | 8 | 41 |
| light-missile-flamethrower | 12 | 10 | 10 | 8 | 40 |
| light-sword-arc | 11 | 9 | 10 | 7 | 37 |

Implementation:
- Add `sp: { hull, arms, legs, engine }` to each `PREBUILT_RIGS` entry.
- Server add path already resolves the prebuilt (`resolvePrebuilt` in `server/routes/game.js`) and stamps class/weapons — also stamp `sp`.
- `makeRig`: accept an optional `sp` profile; use it when present, else fall back to `RIG_DEFAULTS[class]` (AI/tests without a prebuilt still work).
- Armour tables (`unit-kinds.js` impact rows) **unchanged** — note: 2× SP ≈ 2× time-to-kill; revisit weapon/armour balance after a playtest (separate pass).
- Tests: a prebuilt rig gets its per-rig SP; a non-prebuilt add still gets `RIG_DEFAULTS`.

## Phase 3 — Wire the Raking Fire rule (the flagged fix)

Machine guns can't damage the front arc (side +4 / rear +8 / front auto-fail) — coded + tested in `arcBonus`/`combat.test.js` but not attached to the weapons.

- `shared/game-state.js` `WEAPONS.longRange`: add `perks: ["Raking Fire"]` to **Mini Gun** and **Double MG**.
- `rules.md`: document Raking Fire on the two MGs.
- Recheck MG-firing tests (`combat.test.js`, `battle-view.test.js`) don't assume front-arc hits; fix any that do.

---

## Phase 4 — Upgrade nature system (plumbing)

### Data model
- Add `nature: "field" | "tuned" | "prototype"` to every `WEAPON_UPGRADES[weapon][i]`.
- **Each weapon has exactly 3 upgrades, one per nature** (up from 2). See the per-weapon table below for the final set (keep / rename / add / drop).
- Definitions (from AGENTS.md): Field = unconditional upside, viable alone. Tuned = conditional trigger, strictly upside. Prototype = systemic/tracked, may carry a downside; **max one per rig**.

### Selection & enforcement
- Wizard (`UnitWizard.tsx`): upgrade lists already render `WEAPON_UPGRADES[name]` — now 3 each. Add a **nature badge** per choice. **Disable the second Prototype**: if one weapon's pick is Prototype, grey out the other weapon's Prototype option (and vice-versa).
- Server: extend the add guard (`enforcePrebuilt`/a sibling in `server/routes/game.js`) to reject an add whose two chosen upgrades are **both Prototype**, and to reject unknown upgrade ids for the weapon.

### Final upgrade set per weapon
`✅` = existing effect, wire as-is · `🔧` = new mechanic (Phase 5) · *(drop)* = remove the old upgrade.

**Long-range**

| Weapon | Field | Tuned | Prototype | Dropped |
|---|---|---|---|---|
| Siege Maul | Reinforced Head 🔧`{str:2}` | Breaching Rounds ✅ | Piledriver Protocol 🔧 | extended-barrel |
| Sniper Cannon | Marksman Optics ✅ (Precision) | Cold Bore 🔧 (+3 STR vs undamaged) | Enfilade 🔧 (spatial) | match-barrel |
| Double MG | Gyro Mount ✅ (rerollMisses) | Pinning Burst 🔧 (4+ hits → −1 action) | Kneecapper 🔧 | tracer-rounds |
| Mortar | Cluster Shells ✅ | Airburst Fuze ✅ | Barrage 🔧 (spatial) | — |
| Arc Gun | Ion Burn ✅ (Incendiary) | Systems Overload ✅ | Ion Storm 🔧 | — |
| Missile Barrage | Swarm Warheads ✅ | Shaped Charges ✅ | Fire Control Lock 🔧 | — |
| Autocannon | Depleted Core ✅ (+2 STR) | AP Shells ✅ | Penetrator Rounds 🔧 | — |
| Mini Gun | Suppressive Fire ✅ (Shock) | Extended Belt ✅ | Suppression Lock 🔧 | — |

**Melee**

| Weapon | Field | Tuned | Prototype | Dropped |
|---|---|---|---|---|
| Bulwark Shield | Tower Shield ✅ (front+side) | Anvil Boss 🔧 (riposte) | Emplacement 🔧 (stance; obj-lock spatial) | boss-spike |
| Chainsaw | Ripper Teeth ✅ (Rend) | Bloodletter 🔧 (+1 ROF vs damaged) | Redline Governor 🔧 (heat-scaling) | high-rev-motor |
| Wrecking Ball | Haymaker ✅ (+3 STR) | Momentum Swing 🔧 (charge; knockback spatial) | Tow Chain 🔧 (fling — spatial) | wrecking-momentum |
| Lance | Couched Reach ✅ **bump `range:1`→`2`** | Full Tilt 🔧 (charge +3 STR) | Skewer 🔧 (engagement) | spearpoint |
| Sword | Duelist's Balance ✅ (Precision) | Opportunist 🔧 (+3 STR vs disrupted) | Superconductor Edge 🔧 (heat-transfer) | keen-edge |
| Flamethrower | Sticky Fuel ✅ (Rend) | Napalm 🔧 (Burning) | Conflagration 🔧 (stacking Burning) | pressurized-tank |
| Claw | Rending Talons ✅ (Rend) | Vice Grip ✅ (Impale) | Breach Grip 🔧 (armor crack) | — |
| Circular Saw | Tempered Teeth ✅ (AP) | Sunder ✅ | Dismember 🔧 (max-SP → cripple) | — |

Note: "Suppressive Fire" is the Mini Gun's existing Shock upgrade; the Double MG's new pin upgrade is renamed **Pinning Burst** to avoid a name clash.

The `✅` upgrades ship the moment the `nature` field + 3rd-slot data exist — do them first inside Phase 4. Every rig then has a fully playable Field + a real choice, even before any 🔧 mechanic lands.

---

## Phase 5 — New mechanics (🔧), by kind

Build incrementally; each is independently testable. Grouped by the engine surface they touch.

**Simple stat/conditional (small):**
- Reinforced Head `{str:2}`, Cold Bore (+3 STR if target all-locations at max SP), Bloodletter (+1 ROF if target missing SP), Full Tilt (+3 STR if attacker advanced ≥ ½ Speed), Opportunist (+3 STR if target heat>cap or has action penalty).

**Status flags (small–medium):**
- Pinning Burst (count hits ≥4 → `actionPenaltyNextActivation`).
- Anvil Boss (on being meleed while `preparation.type==="raise-shield"`, once/round free STR-6 counter).
- Napalm / Conflagration → **Burning** status: a `burning` counter, ticks SP at activation start, `douse` action clears (all for Napalm, 1/action for Conflagration); Conflagration stacks + adds attacker heat.
- Redline Governor (+1 STR/+1 hit per point of attacker heat over cap, cap +3).
- Superconductor Edge (attacker heat > ½ cap → +2 Sword STR + move 1 heat attacker→target/hit).
- Vice Grip is already Impale ✅.

**Heat / cooldown / cadence (medium):**
- Ion Storm (lockout state: no Prepare/actives/−1 action + heat spike on target; +3 self-heat + lock own Arc Gun next turn).
- Fire Control Lock (`lockedTarget` id; next volley auto-hits + AP; expires).
- Penetrator Rounds (every-3rd-attack counter → bypass armour row (force severe); halve ROF next turn).
- Suppression Lock (per-target consecutive-fire ramp → speed/action/immobilise; +1 self-heat/turn).

**Engagement (medium):**
- Skewer (`skewered` flag on the `engagedWith` link; the pinned target's `disengage` triggers a free STR-11 Lance strike — reuse the `return` counter path).

**Per-location tracking (medium–large):**
- Breach Grip (`cracked` flag + timer on a location → +2 impact vs it in `rollImpacts`, any attacker).
- Kneecapper (MG limited to limb locations any arc, bypassing Raking-Fire front auto-fail for legs/arms only, never hull/engine; per-limb cripple ramp: half SP = functional debuff, 0 = destroyed).
- Dismember (per-location cumulative Sunder; at ½ original max SP → crippled: legs immobilise / arm weapon-dead / hull-engine no-repair).

**Momentum / stance (large):**
- Piledriver Protocol (Momentum counter +1/advance cap 3; spend on a Maul shot → guard-break + STR + shove; blocks Raise Shield while Momentum>0).
- Emplacement (rooted stance flag; permanent auto Raise-Shield; action budget 3→2; +2 heat on exit; 3-turn cooldown from entry; objective-lock).

**Spatial — grandfathered, need a positional model or manual/narrated resolution** (flagged per AGENTS "no new battlefield mechanics", but user approved these already):
- Enfilade (ricochet to a rig in LoS of the struck target), Barrage (3″ shelled zone), Tow Chain (fling 4″), Momentum Swing knockback (3″), Piledriver shove (3″), Emplacement objective-lock.
- Until a grid/positional layer exists, resolve these by narration / manual adjudication, or defer the spatial portion and ship the non-spatial part (e.g. Momentum Swing's +2 STR now, knockback later).

---

## Testing
- Phase 1–3: constant/data changes — update the touched tests; add a per-rig-SP test and a Raking-Fire-front-fail integration check.
- Phase 4: nature field present on all upgrades; wizard disables the 2nd Prototype; server rejects a double-Prototype add and unknown upgrade ids.
- Phase 5: TDD each mechanic (game rules — write the test first per the repo's TDD norm). Keep `rules.md` in sync with every `shared/rules.js`/`game-state.js` rule (AGENTS workflow).

## Follow-ups (not in this spec)
- Author `content/prebuilts.json` `description` / `personality` (the `focus` per rig is fixed by the design docs and can seed the file).
- Post-playtest balance pass on weapon output vs the new 2× SP.
