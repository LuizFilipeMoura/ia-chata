# V2 Status Strip — Minimal Utility Line

**Date:** 2026-07-11
**Status:** Approved design
**Scope:** 2 files (`Shell.tsx`, `shell.css`) + 1 test file

## Problem

The V2 top status strip (`.v2-strip`) is a static identity + connection bar that
earns little of its ~42px height. It shows brand chrome (badge, "OIL & IRON"
wordmark, "MK·IV" plate) and fake telemetry ("LINK · LOCAL" with a green lamp)
that never changes. The wordmark is already shouted on the join screen, so
in-room it is redundant. Only two elements do real work: the **room code**
(players need it to share the room) and the **glossary** button.

## Goal

Strip the bar down to a thin, recessive utility line. The badge alone carries
in-room brand identity. Reclaim vertical space and visual attention for the
screen content below.

Direction chosen during brainstorming: **D (minimal) → V3 (badge only)**.

## Final Strip Contents

Left → right, single row:

1. **Badge** — the stamped iron square with glowing core, shrunk. Decorative,
   no wordmark beside it.
2. **Spacer** — pushes the rest right.
3. **Room code** — `RM IRON-42`, mono, faint key + oil-hi value.
4. **Glossary** — the `ⓘ` button, unchanged behavior.

Removed: `.v2-brand-name` wordmark, `.v2-brand-mk` plate, the entire
`.v2-telemetry` block (green lamp, "LINK", "LOCAL", hairline separator).

## Changes

### `client/src/v2/components/Shell.tsx` (strip markup, ~lines 49–69)

- Keep `<header class="v2-strip">`, the `.v2-brand` badge (`.v2-brand-badge`
  `.v2-badge` + `.v2-brand-core`), the spacer, and the glossary button.
- Delete `.v2-brand-name` and `.v2-brand-mk` elements.
- Delete the whole `.v2-telemetry` block. Replace the room-code readout with a
  single lightweight element (e.g. `<div class="v2-strip-rm">RM <span>{room}</span></div>`)
  so the room code survives without the LINK lamp/sep.

### `client/src/v2/styles/shell.css` (strip rules, ~lines 13–32)

- `.v2-strip` padding `10px 16px 9px` → `6px 14px` (target height ≈30px).
- `.v2-brand-badge` `30px` → `20px`; `.v2-brand-core` `12px` → `8px` (keep the
  gradients/shadows, just scale).
- Remove now-dead strip-only selectors: `.v2-brand-name`, `.v2-brand-mk`,
  `.v2-telemetry`, `.v2-tele`, `.v2-tele-key`, `.v2-tele-val`, `.v2-tele-sep`.
- **Do NOT remove** `.v2-lamp--ok` (also used in `chat/ChatPanel.tsx`) or the
  `.v2-badge` primitive (used in `ChatPanel.tsx` + `primitives.css`). The strip
  simply stops referencing the lamp.
- Add a small `.v2-strip-rm` rule: mono, `--v2-text-sm`, faint key color, value
  in `--v2-oil-hi`. May reuse the trimmed `.v2-tele` styling values.

### `client/src/v2/components/Shell.test.tsx`

Existing tests already assert the room code (`/IRON-42/`) renders and the
glossary handler fires — these must keep passing (regression guard for the two
survivors). Add assertions that the removed chrome is gone:

- `screen.queryByText(/OIL & IRON/i)` is `null` (wordmark removed).
- `screen.queryByText(/MK·IV/)` is `null`.
- `screen.queryByText(/LINK/)` and `/LOCAL/` are `null`.

## Non-Goals

- No change to channel nav, command dock, or CRT overlays.
- No new live-telemetry data (that was direction B, rejected).
- No change to the join-screen hero wordmark.

## Verification

- `vitest run Shell` green (updated assertions + existing room/glossary guards).
- Visual check in dev server: strip is one thin line, badge + room code +
  glossary only, no wordmark/plate/lamp; content area gains vertical space.
