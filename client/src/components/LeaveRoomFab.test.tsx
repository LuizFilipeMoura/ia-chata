import { render, screen, fireEvent } from "@testing-library/react";
import { vi } from "vitest";
import { LeaveRoomFab } from "./LeaveRoomFab";
import { RoomProvider, useRoomState } from "../state/RoomStateContext";
import { saveSession } from "../state/session";

function RoomProbe() {
  const { session } = useRoomState();
  return <div data-testid="room">{session?.room ?? "none"}</div>;
}

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

test("Leave room keeps local storage when confirmation is cancelled", () => {
  vi.spyOn(window, "confirm").mockImplementation(() => {
    throw new Error("Do not use browser confirm for leave room");
  });
  saveSession({ room: "IRON42", side: "a", name: "Lu" });
  localStorage.setItem("ooi-extra", "kept");
  render(
    <RoomProvider>
      <LeaveRoomFab />
      <RoomProbe />
    </RoomProvider>,
  );
  expect(screen.getByTestId("room").textContent).toBe("IRON42");

  fireEvent.click(screen.getByRole("button", { name: /leave room/i }));
  expect(screen.getByRole("dialog", { name: /leave room/i })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /stay/i }));

  expect(window.confirm).not.toHaveBeenCalled();
  expect(screen.queryByRole("dialog", { name: /leave room/i })).not.toBeInTheDocument();
  expect(screen.getByTestId("room").textContent).toBe("IRON42");
  expect(localStorage.getItem("ooi-session-v1")).not.toBeNull();
  expect(localStorage.getItem("ooi-extra")).toBe("kept");
});

test("Leave room clears all local storage and resets room state after in-app confirmation", () => {
  vi.spyOn(window, "confirm").mockImplementation(() => {
    throw new Error("Do not use browser confirm for leave room");
  });
  saveSession({ room: "IRON42", side: "a", name: "Lu" });
  localStorage.setItem("ooi-extra", "clear-me");
  render(
    <RoomProvider>
      <LeaveRoomFab />
      <RoomProbe />
    </RoomProvider>,
  );
  expect(screen.getByTestId("room").textContent).toBe("IRON42");

  fireEvent.click(screen.getByRole("button", { name: /leave room/i }));
  fireEvent.click(screen.getByRole("button", { name: /erase and leave/i }));

  expect(window.confirm).not.toHaveBeenCalled();
  expect(screen.getByTestId("room").textContent).toBe("none");
  expect(localStorage.getItem("ooi-session-v1")).toBeNull();
  expect(localStorage.getItem("ooi-extra")).toBeNull();
});
