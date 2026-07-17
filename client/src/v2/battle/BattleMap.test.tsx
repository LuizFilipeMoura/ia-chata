import { render } from "@testing-library/react";
import { expect, test } from "vitest";
import { BattleMapLayers } from "./BattleMap";
import type { FieldState, Rig } from "../../state/types";

const field = { width: 54, height: 36, diagonal: "tlbr", terrain: [], locked: true } as unknown as FieldState;

const rig = (over: Partial<Rig>): Rig => ({
  id: 1, name: "RED", owner: "a", weightClass: "light",
  hull: { sp: 6, max: 6, destroyed: false }, arms: { sp: 5, max: 5, destroyed: false },
  legs: { sp: 5, max: 5, destroyed: false }, engine: { sp: 4, max: 4, destroyed: false, heat: 0 },
  equipment: null, activated: false, destroyed: false, pos: { x: 10, y: 10 }, facing: 0, ...over,
} as Rig);

test("renders a token per living rig at its projected position", () => {
  const rigs = [rig({ id: 1, name: "RED", owner: "a", pos: { x: 10, y: 10 } }),
                rig({ id: 2, name: "GREY", owner: "b", pos: { x: 40, y: 25 } })];
  const { getAllByTestId } = render(
    <svg><BattleMapLayers field={field} rigs={rigs} mySide="a" ownerSide="a" priorityTargetId={null}
      selectedId={null} onSelect={() => {}} onActivate={() => {}} activatable={() => false} /></svg>,
  );
  expect(getAllByTestId("rig-token")).toHaveLength(2);
});

test("omits destroyed rigs and dims already-activated ones", () => {
  const rigs = [rig({ id: 1, activated: true }), rig({ id: 2, destroyed: true, pos: { x: 5, y: 5 } })];
  const { getAllByTestId } = render(
    <svg><BattleMapLayers field={field} rigs={rigs} mySide="a" ownerSide="a" priorityTargetId={null}
      selectedId={null} onSelect={() => {}} onActivate={() => {}} activatable={() => false} /></svg>,
  );
  const tokens = getAllByTestId("rig-token");
  expect(tokens).toHaveLength(1);
  expect(tokens[0].getAttribute("data-activated")).toBe("true");
});

test("marks the priority-target enemy", () => {
  const rigs = [rig({ id: 2, owner: "b", pos: { x: 40, y: 25 } })];
  const { getByTestId } = render(
    <svg><BattleMapLayers field={field} rigs={rigs} mySide="a" ownerSide="a" priorityTargetId={2}
      selectedId={null} onSelect={() => {}} onActivate={() => {}} activatable={() => false} /></svg>,
  );
  expect(getByTestId("priority-ring")).toBeTruthy();
});
