import { useEffect } from "react";
import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { V2Providers } from "./state/V2Providers";
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
  render(<V2Providers><V2App /></V2Providers>);
  expect(screen.getByText(/ENLIST · COMMISSION · DEPLOY/i)).toBeInTheDocument();
});

test("renders the Terminal shell once a session exists", async () => {
  render(<V2Providers><Seed /><V2App /></V2Providers>);
  expect(await screen.findByText(/CMD DOCK/i)).toBeInTheDocument();
});
