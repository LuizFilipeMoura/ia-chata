import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AnswerGateBody } from "./useBattleWatchers";
import type { Rig, PrepType } from "../state/types";

// Minimal Rig stubs — the gate body only reads `name` and `weapons.melee`.
function rig(name: string, melee?: string): Rig {
  return { name, weapons: melee ? { melee } : {} } as unknown as Rig;
}

test("clicking a reaction moves the selection highlight and mirrors it to pick", async () => {
  const pick = { rigName: "Warden", prep: "brace" as PrepType };
  render(
    <AnswerGateBody remaining={1} eligible={[rig("Warden"), rig("Killdozer")]} pick={pick} />,
  );

  const brace = screen.getByText("Brace for Incoming Fire").closest("button")!;
  const evasive = screen.getByText("Evasive Manoeuvre").closest("button")!;
  expect(brace.className).toContain("sel");
  expect(evasive.className).not.toContain("sel");

  await userEvent.click(evasive);

  // The bug: mutating `pick` never re-rendered, so the highlight stayed on Brace.
  expect(evasive.className).toContain("sel");
  expect(brace.className).not.toContain("sel");
  expect(pick.prep).toBe("evasive");
});

test("switching Rig re-renders and surfaces Raise Shield for a Bulwark carrier", async () => {
  const pick = { rigName: "Warden", prep: "brace" as PrepType };
  render(
    <AnswerGateBody
      remaining={1}
      eligible={[rig("Warden"), rig("Bulwark", "Bulwark Shield")]}
      pick={pick}
    />,
  );

  expect(screen.queryByText("Raise Shield")).toBeNull();

  await userEvent.click(screen.getByText("Bulwark"));

  expect(screen.getByText("Raise Shield")).toBeInTheDocument();
  expect(pick.rigName).toBe("Bulwark");
});
