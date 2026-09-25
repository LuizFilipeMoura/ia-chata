// Engine-dice bookkeeping for Undo (rules.md §Undo). Every helper that draws
// from the RNG (rollD in game-state.js AND combat.js, randomPick, shuffleInPlace,
// autoDeploy's scatter) calls markRng() — only on the random branch, never when
// the player supplied the die (physical rooms type their real dice). applyCommand
// resets the flag before a command and reads it after: a command that rolled
// engine dice wipes the undo history, so nobody can Revert a bad roll and roll
// again.
let used = false;

export function markRng() { used = true; }
export function resetRng() { used = false; }
export function rngWasUsed() { return used; }
