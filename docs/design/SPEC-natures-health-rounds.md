# Spec — Upgrade Natures · Per-Rig Health · 10-Round Cap

**Status: Phases 1–5 shipped.** Every upgrade below is live in `shared/game-state.js` (`WEAPON_UPGRADES`) and `shared/combat.js`. This doc is kept as the historical build plan; each phase is marked with its completion state. The one open item is the content/personality follow-up at the bottom (unrelated to mechanics).

One umbrella change with three parts. Built in the phase order below; Phases 1–3 were quick, safe, and unblocked longer playtests immediately, then the nature plumbing, then the new mechanics one at a time.

Reference: per-rig upgrade details live in the eight `docs/design/<rig-id>.md` files. Constraints in [AGENTS.md](../../AGENTS.md): weapons globally unique, one rig per field (no mirror matchups), upgrade natures = Field / Tuned / Prototype, **max one Prototype per rig**. Spatial effects (Group G below) are **not** deferred — per AGENTS.md, "the app is a tabletop assistant, not a simulator," so they ship as narrated player instructions: the engine simulates the SP/heat/cooldown side and tells the players what to do on the table.

---

## Phase 1 — Round cap 5 → 10 ✅ done

- `shared/game-state.js`: add `export const MAX_ROUNDS = 10;`. Replace the magic `5` at `advanceRound` (`room.game.round >= 5` → `>= MAX_ROUNDS`). Update the comment at ~1154.
- Copy sync "5 rounds" → "10 rounds": `rules.md` (2 spots, §11 + victory), `server/prompt.js` (~128), `shared/glossary.js` (2 defs).
- Test: `shared/game-state.test.js:864` "after round 5 the higher VP wins" → drive to round 10.
- Leave the "quicker game uses 4" note in rules.md as an optional variant, or drop it — maintainer's call.

## Phase 2 — Per-rig health (new SP data axis) ✅ done

Rigs currently derive SP from `RIG_DEFAULTS[class]`. Make SP **per chassis** so durability expresses identity. SP lives in `CHASSIS` (code-authoritative, same as weapons/class — NOT in `content/chassis.json`).

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
- Add `sp: { hull, arms, legs, engine }` to each `CHASSIS` entry.
- Server add path already resolves the chassis (`resolveChassis` in `server/routes/game.js`) and stamps class/weapons — also stamp `sp`.
- `makeRig`: accept an optional `sp` profile; use it when present, else fall back to `RIG_DEFAULTS[class]` (AI/tests without a chassis still work).
- Armour tables (`unit-kinds.js` impact rows) **unchanged** — note: 2× SP ≈ 2× time-to-kill; revisit weapon/armour balance after a playtest (separate pass).
- Tests: a chassis rig gets its per-rig SP; a non-chassis add still gets `RIG_DEFAULTS`.

## Phase 3 — Wire the Raking Fire rule (the flagged fix) ✅ done

Machine guns can't damage the front arc (side +4 / rear +8 / front auto-fail) — coded + tested in `arcBonus`/`combat.test.js` and now attached to the weapons.

- `shared/game-state.js` `WEAPONS.longRange`: `perks: ["Raking Fire"]` is set on **Mini Gun** and **Double MG**.
- `rules.md` documents Raking Fire on the two MGs.
- MG-firing tests (`combat.test.js`, `battle-view.test.js`) account for the front-arc auto-fail.

---

## Phase 4 — Upgrade nature system (plumbing) ✅ done

### Data model
- `nature: "field" | "tuned" | "prototype"` is present on every `WEAPON_UPGRADES[weapon][i]`.
- **Each weapon has exactly 3 upgrades, one per nature.** See the per-weapon table below for the final set.
- Definitions (from AGENTS.md): Field = unconditional upside, viable alone. Tuned = conditional trigger, strictly upside. Prototype = systemic/tracked, may carry a downside; **max one per rig**.

### Selection & enforcement
- Wizard (`UnitWizard.tsx`): upgrade lists render `WEAPON_UPGRADES[name]` (3 each) with a **nature badge** per choice, and **disable the second Prototype** — if one weapon's pick is Prototype, the other weapon's Prototype option is greyed out (and vice-versa).
- Server: the add guard in `server/routes/game.js` rejects an add whose two chosen upgrades are **both Prototype**, and rejects unknown upgrade ids for the weapon.

### Final upgrade set per weapon
All entries below are shipped (`✅`); none were dropped after this pass beyond the ids listed in "Dropped" (the old two-upgrade-per-weapon ids retired in favor of the 3-nature set).

**Long-range**

| Weapon | Field | Tuned | Prototype | Dropped |
|---|---|---|---|---|
| Siege Maul | Reinforced Head ✅ `{str:2}` | Breaching Round ✅ | Piledriver Protocol ✅ | extended-barrel |
| Sniper Cannon | Marksman Optics ✅ (Precision) | Cold Bore ✅ (+3 STR vs undamaged) | Enfilade ✅ (narrated ricochet) | match-barrel |
| Double MG | Gyro Mount ✅ (rerollMisses) | Pinning Burst ✅ (4+ hits → −1 action) | Kneecapper ✅ | tracer-rounds |
| Mortar | Cluster Shells ✅ | Airburst Fuze ✅ | Barrage ✅ (narrated zone) | — |
| Arc Gun | Ion Burn ✅ (Incendiary) | Systems Overload ✅ | Ion Storm ✅ | — |
| Missile Barrage | Swarm Warheads ✅ | Shaped Charges ✅ | Fire Control Lock ✅ | — |
| Autocannon | Depleted Core ✅ (+2 STR) | AP Shells ✅ | Penetrator Rounds ✅ | — |
| Mini Gun | Suppressive Fire ✅ (Shock) | Extended Belt ✅ | Suppression Lock ✅ | — |

**Melee**

| Weapon | Field | Tuned | Prototype | Dropped |
|---|---|---|---|---|
| Bulwark Shield | Tower Shield ✅ (front+side) | Anvil Boss ✅ (riposte) | Emplacement ✅ (stance; obj-lock narrated) | boss-spike |
| Chainsaw | Ripper Teeth ✅ (Rend) | Bloodletter ✅ (+1 ROF vs damaged) | Redline Governor ✅ (heat-scaling) | high-rev-motor |
| Wrecking Ball | Haymaker ✅ (+3 STR) | Momentum Swing ✅ (charge; knockback narrated) | Tow Chain ✅ (fling — narrated) | wrecking-momentum |
| Lance | Couched Reach ✅ (`range: 2`) | Full Tilt ✅ (charge +3 STR) | Skewer ✅ (engagement) | spearpoint |
| Sword | Duelist's Balance ✅ (Precision) | Opportunist ✅ (+3 STR vs disrupted) | Superconductor Edge ✅ (heat-transfer) | keen-edge |
| Flamethrower | Sticky Fuel ✅ (Rend) | Napalm ✅ (Burning) | Conflagration ✅ (stacking Burning) | pressurized-tank |
| Claw | Rending Talons ✅ (Rend) | Vice Grip ✅ (Impale) | Breach Grip ✅ (armor crack) | — |
| Circular Saw | Tempered Teeth ✅ (AP) | Sunder ✅ | Dismember ✅ (max-SP → cripple) | — |

Note: "Suppressive Fire" is the Mini Gun's existing Shock upgrade; the Double MG's pin upgrade shipped as **Pinning Burst** to avoid a name clash.

---

## Phase 5 — New mechanics, by kind ✅ done

All groups below (A–G) are implemented in `shared/game-state.js` / `shared/combat.js`, each independently tested. Grouped by the engine surface they touch.

**Simple stat/conditional (small):**
- Reinforced Head `{str:2}`, Cold Bore (+3 STR if target all-locations at max SP), Bloodletter (+1 ROF if target missing SP), Full Tilt (+3 STR if attacker moved this activation), Opportunist (+3 STR if target heat>cap or has an action penalty into its next activation).

**Status flags (small–medium):**
- Pinning Burst (count hits ≥4 → `actionPenaltyNextActivation`).
- Anvil Boss (on a *landed* melee hit while Raise Shield is up, once/round free STR-6 counter, gated by `ripostedThisRound`).
- Napalm / Conflagration → **Burning** status: a `burning` counter, ticks SP to Hull at activation start, `douse` action clears (all — capped at 1 — for Napalm, 1/action for Conflagration); Conflagration stacks uncapped + adds attacker heat per hit.
- Redline Governor (+1 STR/+1 hit per point of attacker heat over cap, cap +3).
- Superconductor Edge (attacker heat > ½ cap → +2 Sword STR + move 1 heat attacker→target once per attack).
- Vice Grip is Impale ✅.

**Heat / cooldown / cadence (medium):**
- Ion Storm (lockout state: no Prepare/actives/−1 action + 2-heat spike on target; +3 self-heat + attacker's own Arc Gun refuses its next fire attempt, which clears the overload).
- Fire Control Lock (`lockedTarget` id; next volley auto-hits + AP; expires after its round).
- Penetrator Rounds (every-3rd-attack counter → bypass armour row, force Severe; halves ROF — floors at 1 — the attack right after).
- Suppression Lock (per-target consecutive-fire ramp → speed/action/scoped pin; +1 self-heat every attack while locked; stack-3 pin (`suppressImmobile`) self-clears each Recovery).

**Engagement (medium):**
- Skewer (`skeweredBy` on the target set by a damaging Lance hit while locked; the pinned target's `disengage` triggers a free STR-11 Lance strike before the lock breaks).

**Per-location tracking (medium–large):**
- Breach Grip (`cracked` map, location → expiry round, on a damaging Claw hit → +2 impact vs it in `rollImpacts`, any attacker, live for 2 rounds).
- Kneecapper (MG remapped onto limb locations any arc, bypassing Raking-Fire front auto-fail for legs/arms at +4 STR only, never hull/engine — `noSpill` blocks the cook-off cascade too; per-limb `kneecapped` tag gates a cripple ramp: leg ≤ half SP → Speed halved next round while it stays there; arm ≤ half SP → this Rig's own ROF halved, all weapons, floors at 1, until repaired above half — no separate "0 SP = destroyed" behavior beyond the normal weapon/leg destruction that already fires at 0 SP for any weapon).
- Dismember (per-location cumulative Sunder via `origMax` yardstick; once max SP ≤ half its commissioned original → crippled once: legs immobilise / arm weapon-dead / hull-engine `noRepair`).

**Momentum / stance (large):**
- Piledriver Protocol (Momentum counter +1/advance cap 3; spend-all-on-a-Maul-shot → guard-break (ignore Brace + cover) + STR + narrated 3″ shove; blocks Raise Shield — downgrades a requested Raise Shield to Brace — while Momentum>0).
- Emplacement (`emplaced` rooted stance flag; permanent auto Raise-Shield re-established each activation; action budget 3→2 (floors at 1); blocks Move/Sprint/Jump Jets; +2 heat on Un-plant; 3-round cooldown from entry).

**Group G — spatial, implemented as narrated player instructions** (per [AGENTS.md](../../AGENTS.md): "the app is a tabletop assistant, not a simulator" — a spatial effect tells the player what to do, the player moves the minis):
- Enfilade (engine tracks the aimed-shot cadence only; on the 3rd it emits an instruction for the player to pick the rig in LoS behind the struck target and resolve a +2 STR hit).
- Barrage (engine tracks the 2-round countdown, Mortar lock, and heat upkeep; emits an instruction for the players to place the 6″–34″/3″ zone marker and apply 1 SP/round to whoever's inside).
- Tow Chain (engine simulates +2 heat, the rest-of-activation root, and the 3-round cooldown; emits an instruction for the players to move the target up to 4″).
- Momentum Swing knockback (engine simulates the +2 STR charge; emits a 3″-knockback instruction on a landed charging hit).
- Piledriver shove (engine simulates the Momentum spend, guard-break, and STR; emits a 3″-shove instruction on a landed hit).
- Emplacement's board-level "hard to dislodge" effect is emergent from its simulated stance (permanent shield + immobility), not a separate spatial mechanic — no objective-lock instruction is needed.

---

## Testing ✅ done
- Phase 1–3: constant/data changes covered — a per-rig-SP test and a Raking-Fire-front-fail integration check exist.
- Phase 4: nature field present on all upgrades; wizard disables the 2nd Prototype; server rejects a double-Prototype add and unknown upgrade ids.
- Phase 5: each mechanic (including Group G's narrated-instruction cadence/state tracking) is covered in `shared/game-state.test.js` / `shared/combat.test.js`. `rules.md`'s "Tuned / Prototype Upgrade Mechanics" section stays in sync with every rule change (AGENTS workflow).

## Follow-ups (not in this spec)
- Author `content/chassis.json` `description` / `personality` (the `focus` per rig is fixed by the design docs and can seed the file).
- Post-playtest balance pass on weapon output vs the new 2× SP.
