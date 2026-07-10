# Agent Instructions

## Project nature

This is a hobby / personal project — a game made for fun by one person. NOT a production app. No team, no external users, no uptime obligations, no support burden. Optimize for the maintainer's fun and iteration speed, not for enterprise caution.

What this means concretely:
- **Refactor freely, but propose first.** Don't be timid about rewriting, deleting, or restructuring large portions of code. When a bigger refactor is worth it, briefly explain the plan (one short paragraph), then execute it — no need to wait for explicit approval. Land it as one commit (see Git workflow below).
- **No backwards-compatibility burden.** Single user. Break save formats, APIs, data shapes, and internal contracts freely. Do NOT write migration shims, compatibility layers, or deprecation paths unless explicitly asked. Just change the thing.
- **Favor fun and iteration speed** over ceremony. Don't over-engineer, don't gold-plate, don't add abstraction for hypothetical future needs. Ship the change, keep it readable.
- **Keep TDD discipline.** Despite the hobby framing, the maintainer values the test safety net — write tests first for real logic (game rules, math, state transitions). UI glue and throwaway experiments can skip it.

## Game design invariants

Hold these when designing rigs, weapons, upgrades, or mechanics:

- **Every weapon is globally unique.** No two prebuilt rigs share a long-range or a melee weapon. Each of the 8 weapons per slot-type belongs to exactly one rig.
- **Each rig appears at most once on the field.** A given prebuilt is never mirrored across the board.
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
