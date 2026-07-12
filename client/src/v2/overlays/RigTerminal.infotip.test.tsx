import { render } from "@testing-library/react";
import { expect, test } from "vitest";
import { GLOSSARY } from "/shared/glossary.js";
import { V2GlossaryTipProvider } from "../state/V2GlossaryTipContext";
import { RigTerminal } from "./RigTerminal";
import type { Rig } from "../../state/types";

const GLOSS_IDS = new Set(GLOSSARY.map((e: { id: string }) => e.id));

// A rig in several concurrent states so many mod chips render at once.
const rig = {
  id: 1, name: "Vela", kind: "rig", weightClass: "light", owner: "a",
  hull: { sp: 3, max: 6 }, arms: { sp: 5, max: 5 }, legs: { sp: 5, max: 5 },
  engine: { sp: 4, max: 4, heat: 2 },
  burning: 2, engaged: true, engagedWith: 7, painted: { by: "b", painterId: 9 },
} as unknown as Rig;

test("every click-to-explain token in the terminal resolves to a glossary def", () => {
  const { container } = render(
    <V2GlossaryTipProvider>
      <RigTerminal
        rig={rig}
        canActivate={false}
        started={false}
        mine={false}
        myTurn={false}
        onCommand={() => {}}
        onClose={() => {}}
      />
    </V2GlossaryTipProvider>,
  );
  const tokens = container.querySelectorAll<HTMLElement>("[data-info]");
  expect(tokens.length).toBeGreaterThan(0);
  for (const el of tokens) {
    const id = el.getAttribute("data-info")!;
    expect(GLOSS_IDS.has(id), `data-info "${id}" has no glossary entry`).toBe(true);
  }
});
