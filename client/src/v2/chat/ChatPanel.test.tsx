import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { ChatProvider } from "../../components/chat/ChatContext";
import { UiProvider } from "../../state/UiStateContext";
import { RoomProvider } from "../../state/RoomStateContext";
import { ChatPanel } from "./ChatPanel";

test("seeds the Quartermaster greeting", async () => {
  render(<RoomProvider><UiProvider><ChatProvider><ChatPanel onBotMessage={() => {}} /></ChatProvider></UiProvider></RoomProvider>);
  expect(await screen.findByText(/anything about the .+ rulebook/i)).toBeInTheDocument();
});
