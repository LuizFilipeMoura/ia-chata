import { render, screen } from "@testing-library/react";
import App from "./App";
import { RoomProvider } from "./state/RoomStateContext";
import { UiProvider } from "./state/UiStateContext";

test("shows the join gate when no session exists", () => {
  render(
    <RoomProvider>
      <UiProvider>
        <App />
      </UiProvider>
    </RoomProvider>,
  );
  expect(screen.getByText(/Enter a battle room/i)).toBeInTheDocument();
});
