import { useEffect } from "react";
import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { AppProviders } from "../AppProviders";
import { useRoomDispatch } from "../state/RoomStateContext";
import V2App from "./V2App";

vi.mock("../hooks/useRoomSocket", () => ({ useRoomSocket: () => {} }));

function Seed() {
  const dispatch = useRoomDispatch();
  useEffect(() => {
    dispatch({ type: "setSession", session: { room: "IRON", side: "a", name: "Kostov" } });
  }, [dispatch]);
  return null;
}

test("renders Join when there is no session", () => {
  render(<AppProviders><V2App /></AppProviders>);
  expect(screen.getByText(/ENLIST · COMMISSION · DEPLOY/i)).toBeInTheDocument();
});

test("renders the Terminal shell once a session exists", async () => {
  render(<AppProviders><Seed /><V2App /></AppProviders>);
  expect(await screen.findByText(/RIG CONTROL TERMINAL/i)).toBeInTheDocument();
});
