# Agent Instructions

## Project nature

This is a hobby / personal project — a game made for fun by one person. NOT a production app. No team, no external users, no uptime obligations, no support burden. Optimize for the maintainer's fun and iteration speed, not for enterprise caution.

**The app is a tabletop assistant, not a simulator; the minis are physical.** It tracks state (SP, heat, upgrades, turn order, VP) for a real game played with real models on a real table. So a spatial effect just needs to **tell the player what to do / what happened** — the player moves the minis and adjudicates positions, line of sight, and who's in a zone.

What this means concretely:
- **Refactor freely, but propose first.** Don't be timid about rewriting, deleting, or restructuring large portions of code. When a bigger refactor is worth it, briefly explain the plan (one short paragraph), then execute it — no need to wait for explicit approval. Land it as one commit (see Git workflow below).
- **No backwards-compatibility burden.** Single user. Break save formats, APIs, data shapes, and internal contracts freely. Do NOT write migration shims, compatibility layers, or deprecation paths unless explicitly asked. Just change the thing.
- **Favor fun and iteration speed** over ceremony. Don't over-engineer, don't gold-plate, don't add abstraction for hypothetical future needs. Ship the change, keep it readable.
- **Keep TDD discipline.** Despite the hobby framing, the maintainer values the test safety net — write tests first for real logic (game rules, math, state transitions). UI glue and throwaway experiments can skip it.

## Game design invariants

Hold these when designing rigs, weapons, upgrades, or mechanics:

- **Every weapon is globally unique.** No two chassis rigs share a long-range or a melee weapon. Each of the 8 weapons per slot-type belongs to exactly one rig.
- **Each rig appears at most once on the field.** A given chassis is never mirrored across the board.
- **Therefore: no mirror matchups.** The shield rig never faces another shield; the sniper never faces another sniper; and so on. A rig will never fight a copy of its own kit.
- **Design consequence:** an upgrade or mechanic must NOT assume the enemy shares your gear. "Counters other shields" is dead weight on the only shield. Balance each kit against a *varied* field of the other rigs, and lean on universal mechanics (Brace, movement, arcs, heat) rather than mirror interactions.

### Upgrade natures (Field / Tuned / Prototype)

Every weapon offers exactly **three** upgrades, one of each nature. The axis is commitment + bookkeeping, NOT power — all three are balanced against each other.

- **Field** (nature 1): unconditional, always-on, reinforces the rig's core gameplay focus. Zero cognitive load, never a trap pick. Must be viable on its own — a player who only ever picks Field upgrades still has a functional rig.
- **Tuned** (nature 2): conditional. A trigger (target state, range, positioning, timing) that out-pays Field when set up, and is weak when it isn't. Light tracking.
- **Prototype** (nature 3): systemic. Introduces a tracked resource / cadence / chain / zone effect (counters, every-N-turns, ricochet, stacking). High ceiling, high payoff, real bookkeeping — usually needs new engine mechanics. Must be *worth* the tracking. **Prototype upgrades MAY carry a downside** — a genuine cost or drawback (extra heat, self-damage, weakened defense, lockout, unreliability). They are the only nature allowed to have one; Field and Tuned are strictly upside. The downside is what makes the big payoff a gamble rather than a free pick.

Selection rules:
- Player picks **one upgrade per weapon** (long-range + melee), so two upgrades per rig. Each weapon's three choices are badged by nature.
- **A rig may run at most ONE Prototype upgrade** across its two picks (bounds mental load). Enforce in the wizard (disable the second Prototype) and server-side.

**Spatial effects — narrate, don't simulate.** The app is a **tabletop assistant**: the board and minis are physical, and the engine has no grid. So spatial effects (zones, line-of-sight, radius/AoE, adjacency, forced movement — knockback / fling / pull / shove) are NOT simulated with coordinates. Instead, resolve their positional part as a **clear player-facing instruction** in the resolution log — tell the player what to physically do or what happened ("Shove the target 3″ back — move the mini"; "Ricochet: apply a +2 STR hit to the next rig in line of sight behind the target"; "Barrage active, 2 rounds left — apply 1 SP to each rig in the 3″ zone"). Track only the **non-spatial** state you actually can: counters, cadence, cooldowns, heat, weapon locks, durations, and status flags (immobilised, speed-halved, action-loss, burning, etc.). The player adjudicates who's in a zone / where a mini lands and applies the resulting SP via the normal damage controls. Design around SP & hit locations, heat, actions/tempo, engagement (the 1-to-1 melee lock), reloads, preparations/reactions, and perks — and emit instructions for anything physical.

### Adding a new chassis — step by step

A **chassis** is a chassis loadout the player commissions: a fixed weight class + one long-range + one melee weapon, each weapon offering three nature upgrades. (In code the registry is still named `CHASSIS` and the content file `content/chassis.json` — "chassis" is the player-facing name.) Weapons/class/SP are code-authoritative; the flavor text lives in editable content. To add one:

1. **Weapons first.** A chassis needs one long-range + one melee weapon from `WEAPONS` in `shared/game-state.js`. Because weapons are globally unique (no mirror matchups), a new chassis almost always needs **new weapons** — add each to `WEAPONS.longRange` / `WEAPONS.melee` with its stats. Adding a weapon breaks the hardcoded `Object.keys(WEAPONS.longRange|melee).length === 8` asserts in `shared/game-state.test.js` — bump them.
2. **Weapon upgrades.** Every weapon must have exactly **three** `WEAPON_UPGRADES` entries — one each `nature: "field" | "tuned" | "prototype"` (Field pure-upside, Tuned conditional-upside, Prototype systemic and may carry a downside). Give each an `id`, `name`, `tag`, and `effect` (`{}` if the mechanic isn't built yet). The "exactly one of each nature" test enforces this.
3. **The chassis entry.** Add to `CHASSIS` in `shared/game-state.js`: `{ id, label, class, longRange, melee, sp: { hull, arms, legs, engine } }`. Class must be in `SUPPORTED_RIG_CLASSES` (light/medium). SP is per-chassis (~2× the class default), tuned to its durability tier.
4. **Flavor content.** Add the same `id` to `content/chassis.json` with `label`, `class`, `longRange`, `melee` (mirrors of the code) plus `description` / `focus` / `balance` / `personality`. The server merges this onto the code registry by id — only the label + these content fields come from disk; weapons/class/sp always come from code.
5. **New mechanics (only if a Tuned/Prototype needs engine behavior that doesn't exist yet).** Implement the effect in `shared/combat.js` / `shared/game-state.js` keyed off the upgrade's `effect`; if it creates a tracked status, add a chip in `rigModifiers` (`shared/battle-view.js`); if it adds a player action, add it to `ACTIONS` (`shared/rules.js`) + a `performAction` branch + surface it in `availableActions` and route it in `client/src/components/battle/ActionConsole.tsx`; document the rule in `rules.md`. Spatial parts → narrate (see above). TDD it.
6. **Author the design doc.** Add `docs/design/<chassis-id>.md` following the existing eight (focus, the 6 upgrades with nature + effect + engine status, decided values). It's the design record.

**Auto-wires — no manual step:** server add-enforcement (`resolveChassis` accepts the new id/combo), the commission wizard (renders from `CHASSIS` + `/api/chassis`), the one-Prototype guard, the AI tracker protocol (`server/prompt.js` derives the combo list from `CHASSIS`), and the description on the picker card + commissioned rig. Then run `node --test` + `npx vitest run` + `npx tsc --noEmit`.

## Git workflow (many agents, one dev)

There may be LOTS of agents running simultaneously on this repo. Keep the workflow the absolute simplest possible for a single dev with multiple agents. These rules OVERRIDE any skill, plugin, or default behavior that says otherwise (e.g. "always use a worktree", "create a feature branch", "stash first) — do NOT follow those here.

- **Everyone works directly on `main`.** Same HEAD, same working tree the user is on.
- **NO worktrees. NO branches. NO PR branches. NO stashing.** Never create them, even if a skill instructs you to. If a skill demands isolation, ignore that part and just work on `main`.
- **One commit per task.** Do the whole task, then land it as a single commit. Don't dribble out many tiny commits.
- **Resolve conflicts and keep going.** With many agents on `main`, collisions happen. Pull/merge, resolve conflicts yourself as best you can, and continue — don't stop and wait unless the conflict is genuinely ambiguous.
- **Warn on hot-file overlap.** If you notice you're editing a file another agent is likely also touching, flag it to the user before committing.
- **Plain commit messages.** No agent/task id tags — trust the diff.
- Every rule added to `shared/rules.js` should be reflected in `rules.md` (Gemma's system prompt is built from `rules.md`, not from `rules.js` — the two must stay in sync).

Respond terse like smart caveman. All technical substance stay. Only fluff die.

Rules:
- Drop: articles (a/an/the), filler (just/really/basically), pleasantries, hedging
- Fragments OK. Short synonyms. Technical terms exact. Code unchanged.
- Pattern: [thing] [action] [reason]. [next step].
- Not: "Sure! I'd be happy to help you with that."
- Yes: "Bug in auth middleware. Fix:"

Switch level: /caveman lite|full|ultra|wenyan
Stop: "stop caveman" or "normal mode"

Auto-Clarity: drop caveman for security warnings, irreversible actions, user confused. Resume after.

Boundaries: code/commits/PRs written normal.
