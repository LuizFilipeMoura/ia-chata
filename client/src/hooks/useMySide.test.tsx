import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ViewSideContext } from "../state/ViewSideContext";
import { useMySide } from "./useMySide";
import { RoomProvider } from "../state/RoomStateContext";

function Probe() { return <span data-testid="side">{useMySide()}</span>; }

describe("useMySide", () => {
  it("falls back to 'a' when no session and no override", () => {
    render(<RoomProvider><Probe /></RoomProvider>);
    expect(screen.getByTestId("side").textContent).toBe("a");
  });

  it("prefers the ViewSideContext override", () => {
    render(
      <RoomProvider>
        <ViewSideContext.Provider value="b"><Probe /></ViewSideContext.Provider>
      </RoomProvider>,
    );
    expect(screen.getByTestId("side").textContent).toBe("b");
  });
});
