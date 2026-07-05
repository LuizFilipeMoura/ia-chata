# Agent Instructions

- Do not create branches.
- Use the same HEAD and worktree the user is already using.
- Work directly on `main`.
- Commit every significant change so the user can inspect the git history.
- Do not create feature branches, worktrees, or PR branches unless the user explicitly overrides this file.
- Every rule added to `shared/rules.js` should be reflected in `rules.md` (Gemma's system prompt is built from `rules.md`, not from `rules.js` — the two must stay in sync).
