# V2 Frontend — Phase D Design (Chat / Quartermaster + Glossary)

**Date:** 2026-07-11
**Status:** Approved (pre-approved for all 4 phases). Final phase.
**Depends on:** Phases A–C. Same architecture.

## Goal

Wire the Quartermaster rules-chat and the glossary into V2, removing the last disabled/stubbed
controls (the Rulebook dock button). Reuse V1's chat + glossary machinery wholesale — it is all
driven by the shared `UiStateContext` (`chatOpen`, `glossaryOpen`) already in `AppProviders`, plus
`ChatProvider`, `useChatStream` (which parses `[[RIG …]]` tags and dispatches real commands),
`useSpeech`, markdown, TTS, mic, PT/EN. Restyling the chat panel to the mockup's V2 look
(lines 453–475) is deferred; the reused panel is a documented interim, consistent with the reuse of
the commission wizard (A/B), field map, and battle overlays (C).

## Scope

**Wired in V2 (reusing V1 components):**
- **Quartermaster chat:** mount V1 `ChatProvider` + `ChatPanel` in V2Terminal (a `V2ChatMount`).
  Driven by `useUi().chatOpen`. Unread flagging via the panel's `onBotMessage`.
- **Rulebook trigger:** the V2 command-dock **Rulebook** button (disabled since Phase A) becomes
  enabled and toggles `chatOpen`; it shows an unread dot. The **Rules** channel button toggles it too.
- **Glossary:** mount V1 `GlossaryDialog` driven by `useUi().glossaryOpen`; add a glossary trigger
  to the V2 status strip (an ⓘ button) that opens it. Inline glossary tips (`GlossaryTip`, in
  `AppProviders`) already work wherever `GlossaryText` is used (e.g. inside the reused chat).

**Not in scope:** a V2-native restyle of the chat panel / glossary dialog (reused V1 — interim).

## Components / files

```
client/src/v2/
  components/V2ChatMount.tsx   reuses V1 ChatProvider + ChatPanel; owns hasUnread; toggles via useUi
  V2Terminal.tsx               MODIFY — render <V2ChatMount/> and <GlossaryDialog/> (reused); pass onRulebook to Shell
  components/Shell.tsx         MODIFY — enable Rulebook dock button (onRulebook + unread dot); Rules channel calls onRulebook; add an ⓘ glossary button (onGlossary) to the status strip
```

## Behavior

- **Rulebook button / Rules channel** → `useUi().setChatOpen(!chatOpen)`; opening clears the unread
  flag. The V1 `ChatPanel` slides in (its own styling/portal). The dock button shows a dot when a
  bot message arrived while closed.
- **Glossary ⓘ** in the status strip → `useUi().setGlossaryOpen(true)`; V1 `GlossaryDialog` opens.
- The chat's `[[RIG …]]` command-dispatch, TTS, mic, PT/EN, reasoning-collapse, suggested prompts,
  markdown all work unchanged (V1 components + shared contexts).

## Testing

- Shell: Rulebook dock button is enabled and calls `onRulebook`; the Rules channel calls `onRulebook`;
  the ⓘ glossary button calls `onGlossary`.
- V2ChatMount: mounting with `chatOpen=false` renders the collapsed panel; toggling `chatOpen`
  reveals it (assert via the reused panel's presence). Keep it light — the chat internals are already
  covered by V1 tests.
- CSS isolation guard unaffected (no new global CSS; the reused chat uses V1's `glossary.css`).

## Definition of done (whole V2 project)

After Phase D, the V2 frontend (`?v2`) covers join, squadron, commission, rig terminal, battle
chrome, and chat/glossary — every V1 feature reachable, V1 untouched, all under `.v2-root`. Remaining
V1-styled interims (commission wizard replaced in B; field map, battle overlays, chat panel, glossary
dialog) are functional and documented for a future restyle pass.
