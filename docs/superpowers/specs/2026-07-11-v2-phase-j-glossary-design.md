# V2 Phase J — Glossary (Dialog + Tip + Text)

**Date:** 2026-07-11 · **Status:** Approved · **Depends on:** A–D. Consumed by F/G/I for term highlighting. See overview.

## Goal

Native V2 glossary: the full-list **GlossaryDialog**, the positioned single-term **GlossaryTip**, and
the inline **GlossaryText** wrapper — reusing the shared glossary data + tip state, rewriting presentation.

## Replaces

`components/overlays/GlossaryDialog.tsx`, `components/overlays/GlossaryTip.tsx`,
`components/chat/GlossaryText.tsx`, and the presentation half of `state/GlossaryTipContext.tsx` — for V2.

## Architecture / components

```
client/src/v2/
  state/V2GlossaryTipContext.tsx  useV2GlossaryTip() → { showTip(term, anchorEl), hideTip }; portals the
                                  V2 GlossaryTip. Slots into V2Providers (place reserved in E). Reuses the
                                  shared glossary data from /shared/glossary.js.
  overlays/GlossaryDialog.tsx     V2 full-list modal (from shared glossary), opened by the status-strip ⓘ
                                  (Phase D already wires onGlossary → useUi().glossaryOpen).
  overlays/GlossaryTip.tsx        V2 positioned tooltip (above/below auto-flip, arrow, outside-click/scroll/
                                  esc close) — behavior source is V1 GlossaryTip.tsx.
  chat/GlossaryText.tsx           wraps recognized glossary terms in tappable spans → useV2GlossaryTip().showTip
  styles/glossary.css             .v2-root-scoped dialog + tip + term styles
```

- `V2Terminal` swaps its `GlossaryDialog` import from V1 to `../overlays/GlossaryDialog` and passes
  `open={glossaryOpen}`/`onClose` as today (Phase D).
- The V2 `GlossaryText` (this phase) replaces V1 `GlossaryText` usage inside the V2 chat (Phase I) and
  the RigTerminal loadout tags (currently plain text) — enabling inline tips there.
- `V2Providers` swaps its Phase-E `V2GlossaryTipProvider` stub for the real one here.

## Behavior

- ⓘ opens the full glossary dialog; tapping a highlighted term anywhere in V2 opens a positioned tip;
  the tip auto-flips and closes on outside-click/scroll/esc — identical to V1.

## Testing

- GlossaryText wraps a known term in a button that, on click, calls `showTip` with that term.
- GlossaryDialog lists the shared glossary entries and closes via its close control.
- GlossaryTip renders the term's definition and closes on Escape.

## Done when

`grep -rE "from \"\.\./\.?\./components" client/src/v2` returns **nothing** — no V2 file imports any V1
component. Add this grep as a test/assertion. The whole V2 surface is native under `.v2-root`.
