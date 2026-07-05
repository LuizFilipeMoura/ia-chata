# Task 1 Report

Status: done

Summary:
- Expanded `WEAPON_UPGRADES` to stable `id` + `effect` entries for all 12 weapons.
- Added `defaultWeaponUpgrade`, `normalizeWeaponUpgrade`, and `upgradeForWeapon`.
- Stored `weaponUpgrades` on new rigs and backfilled legacy rigs in `ensureRigShape`.
- Added focused tests covering catalogue shape, normalization, rig creation, add-command propagation, and legacy backfill.

Verification:
- `C:\Users\breke\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe --test shared/game-state.test.js`

Notes:
- Only `shared/game-state.js` and `shared/game-state.test.js` were staged for commit.
