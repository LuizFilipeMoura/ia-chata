import { expect, test } from "vitest";
const files = import.meta.glob("./**/*.{ts,tsx}", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
test("no V2 source imports a V1 presentation module", () => {
  // V2 legitimately reuses V1 LOGIC (hooks/useChatStream, useSpeech, useCommands, useMySide,
  // components/chat/ChatContext, lib/*, state/RoomStateContext, state/UiStateContext) + /shared/*.
  // This guard bans only V1 PRESENTATION modules.
  //
  // BattleHud/TurnBanner are intentionally NOT listed among the top-level component
  // names: V2 ships its OWN native `v2/components/BattleHud` and `v2/components/TurnBanner`,
  // imported as `./components/…` / `../components/…` that resolve INSIDE v2. Those share the
  // V1 names at the same relative `components/` location, so a bare string match can't tell
  // them apart and would false-positive on V2's own presentation. Every other V1-only name
  // stays banned because V2 places its equivalents elsewhere (FieldMap/FieldControls →
  // v2/battle/, OutcomeBanner → v2/overlays/), so `/components/<name>` can only mean V1.
  const banned = /from\s+["'][^"']*\/components\/(overlays|wizards|rig|battle|FieldMap|FieldControls|Topbar|Stage|RigDeck|OutcomeBanner|BattleSetup)|["'][^"']*\/components\/chat\/(ChatPanel|MessageList|Bubble|ChatInput|SuggestedPrompts|GlossaryText)|["'][^"']*\/state\/(DrawerContext|RollContext|WizardContext|BattleActionsContext|GlossaryTipContext)|["'][^"']*\/hooks\/useBattleWatchers/;
  const offenders: string[] = [];
  for (const [path, src] of Object.entries(files)) {
    if (path.includes(".test.")) continue;
    src.split("\n").forEach((line, i) => { if (/^\s*import/.test(line) && banned.test(line)) offenders.push(`${path}:${i + 1} ${line.trim()}`); });
  }
  expect(offenders, offenders.join("\n")).toEqual([]);
});
