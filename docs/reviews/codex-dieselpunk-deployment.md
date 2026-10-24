# Review ledger: codex/dieselpunk-deployment

## Pass 1 (2026-10-24): `2ab6d285..ddd69ece`

Reviewed the committed dieselpunk release against `origin/main`: Black/Tyrian remodeling, six material families, environments, tuning tools, modeling guide, audio/HUD presentation, shared catalog names and beacon replay fixes. Separate correctness/security and structure/quality reviewers inspected Git objects; neither changed files.

## Pass 2 (2026-10-24): working changes added to the release

The maintainer expanded the request to every uncommitted change. Both reviewers also inspected the deployment phase, legal placement and confirmation, bot planner, campaign route, simulation/GA genes, 3D placement controls and threat overlay. The campaign guard, mobile font and guide corrections below received a delta review. The unrelated client-data report is excluded pending an explicit publication choice because the repository is public.

No credentials, focused/skipped tests or unexplained debug output were found in the game changes. Localhost links in the guide and lab exports are intentional development links. Per-file purposes are recorded in the PR's interactive file map.

### Validation

- `node --test --test-reporter=dot "shared/**/*.test.js" "server/**/*.test.js" "scripts/**/*.test.mjs" "client3d/**/*.test.js"`: **1,374 passed**, zero failures.
- `npm run build:3d`: passed. An accidental uncommitted space in `vite.config.js` was corrected, restoring the original script.
- `node node_modules/typescript/bin/tsc --noEmit`: passed.
- `node node_modules/vitest/vitest.mjs run`: **318 passed / 1 failed**, the stale V2 label assertion described below. The first sandboxed attempt failed before tests because Vitest could not rename its cache files; the normal-permission run produced the stated results.
- `git diff --check`: passed.
- The earlier detailed-model browser checks and geometry/material tests remain documented in the Black record and remodeling guide. This release pass did not repeat every visual inspection.

| ID | Tier | Claim | Location | Status | Resolution |
|---|---|---|---|---|---|
| TNR-001 | BLOCKER | Repeated Start run clicks during the stamp delay submit twice; the rejected second request can replace the new map with the wizard. | `client3d/src/ui/campaign.js` | fixed | This commit adds a synchronous commission-scoped guard, disables the button, captures the submitted selections and permits retry only after failure. Reviewed before the first asynchronous boundary. |
| TNR-002 | NOTE | Mobile gauge numerals render below the 12px minimum. | `client3d/src/styles.css` | fixed | This commit raises SVG numeral font to 13px; the 96px mobile gauge renders it at 12.48px. |
| TNR-003 | NOTE | Historical test note does not clearly attribute the stale V2 assertion to the shared catalog rename. | `docs/design/rig-remodeling-guide.md` | fixed | This commit explicitly records Depleted Core → Tungsten Core, with stable upgrade ID/effect. |
| TNR-004 | NOTE | V2 LoadoutView test still asserts the old display name. | `client/src/v2/components/LoadoutView.test.tsx:32` | waived | Approved shared naming change, no runtime behavior regression. Repository instructions prohibit V2 edits unless explicitly requested; disclose the failing assertion rather than adding an alias or reverting the name. |
| TNR-005 | NOTE | In a packed zone, an exhausted deployment lattice can produce a rejected candidate batch when the fallback original position overlaps an earlier planned placement. | `shared/bot/deploy.js` | waived | The engine rejects the batch atomically and the bot confirms the original scatter, so the match continues without partial writes. Follow-up: return an explicit empty plan when no legal complete plan exists, with a packed-zone regression. |

Verdict: **APPROVED WITH NOTES**. One blocker fixed; no open blocker or major. Three rows fixed, two notes waived. Existing oversized files predate this release; no new file crosses the 1,000-line threshold. Cosmetic helper consolidation was not required for the current two-model POC.
