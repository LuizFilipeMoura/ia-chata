import { render } from "@testing-library/react";
import { expect, test, vi } from "vitest";
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
    <svg><BattleMapLayers field={field} objectives={[]} rigs={rigs} mySide="a" ownerSide="a" priorityTargetId={null}
      selectedId={null} onSelect={() => {}} onActivate={() => {}} activatable={() => false} /></svg>,
  );
  expect(getAllByTestId("rig-token")).toHaveLength(2);
});

test("omits destroyed rigs and dims already-activated ones", () => {
  const rigs = [rig({ id: 1, activated: true }), rig({ id: 2, destroyed: true, pos: { x: 5, y: 5 } })];
  const { getAllByTestId } = render(
    <svg><BattleMapLayers field={field} objectives={[]} rigs={rigs} mySide="a" ownerSide="a" priorityTargetId={null}
      selectedId={null} onSelect={() => {}} onActivate={() => {}} activatable={() => false} /></svg>,
  );
  const tokens = getAllByTestId("rig-token");
  expect(tokens).toHaveLength(1);
  expect(tokens[0].getAttribute("data-activated")).toBe("true");
});

test("clicking a token routes to activate when activatable, else select", () => {
  const onSelect = vi.fn();
  const onActivate = vi.fn();
  const mine = rig({ id: 1, owner: "a", pos: { x: 10, y: 10 } });
  const foe = rig({ id: 2, owner: "b", pos: { x: 40, y: 25 } });
  const { getAllByTestId } = render(
    <svg><BattleMapLayers field={field} objectives={[]} rigs={[mine, foe]} mySide="a" ownerSide="a" priorityTargetId={null}
      selectedId={null} onSelect={onSelect} onActivate={onActivate} activatable={(r) => r.id === 1} /></svg>,
  );
  const tokens = getAllByTestId("rig-token");
  tokens.find((t) => t.getAttribute("data-mine") === "true")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  expect(onActivate).toHaveBeenCalledTimes(1);
  expect(onSelect).not.toHaveBeenCalled();
  tokens.find((t) => t.getAttribute("data-mine") === "false")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  expect(onSelect).toHaveBeenCalledTimes(1);
});

test("draws the field furniture as rectangles — grid, terrain and objectives", () => {
  const terrainField = {
    width: 54, height: 36, diagonal: "tlbr", locked: true,
    terrain: [{ x: 20, y: 18, kind: "wood", shape: "poly", points: [[-2, -2], [2, -2], [2, 2], [-2, 2]] }],
  } as unknown as FieldState;
  const objectives = [{ x: 27, y: 18, vp: 2 }, { x: 10, y: 10, vp: 1 }] as unknown as never[];
  const { getAllByTestId, container } = render(
    <svg><BattleMapLayers field={terrainField} objectives={objectives} rigs={[rig({})]} mySide="a"
      ownerSide="a" priorityTargetId={null} selectedId={null}
      onSelect={() => {}} onActivate={() => {}} activatable={() => false} /></svg>,
  );
  expect(getAllByTestId("terrain")).toHaveLength(1);
  expect(container.querySelector("polygon")).toBeNull();
  expect(getAllByTestId("objective")).toHaveLength(2);
});

test("marks the priority-target enemy", () => {
  const rigs = [rig({ id: 2, owner: "b", pos: { x: 40, y: 25 } })];
  const { getByTestId } = render(
    <svg><BattleMapLayers field={field} objectives={[]} rigs={rigs} mySide="a" ownerSide="a" priorityTargetId={2}
      selectedId={null} onSelect={() => {}} onActivate={() => {}} activatable={() => false} /></svg>,
  );
  expect(getByTestId("priority-ring")).toBeTruthy();
});
