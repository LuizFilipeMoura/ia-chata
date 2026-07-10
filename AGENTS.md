# Agent Instructions

## Project nature

This is a hobby / personal project — a game made for fun by one person. NOT a production app. No team, no external users, no uptime obligations, no support burden. Optimize for the maintainer's fun and iteration speed, not for enterprise caution.

What this means concretely:
- **Refactor freely, but propose first.** Don't be timid about rewriting, deleting, or restructuring large portions of code. When a bigger refactor is worth it, briefly explain the plan (one short paragraph), then execute it — no need to wait for explicit approval. Land it as one commit (see Git workflow below).
- **No backwards-compatibility burden.** Single user. Break save formats, APIs, data shapes, and internal contracts freely. Do NOT write migration shims, compatibility layers, or deprecation paths unless explicitly asked. Just change the thing.
- **Favor fun and iteration speed** over ceremony. Don't over-engineer, don't gold-plate, don't add abstraction for hypothetical future needs. Ship the change, keep it readable.
- **Keep TDD discipline.** Despite the hobby framing, the maintainer values the test safety net — write tests first for real logic (game rules, math, state transitions). UI glue and throwaway experiments can skip it.

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
