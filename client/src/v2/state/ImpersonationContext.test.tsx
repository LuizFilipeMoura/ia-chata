import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useContext } from "react";
import { expect, test } from "vitest";
import { ImpersonationProvider, useImpersonation } from "./ImpersonationContext";
import { ViewSideContext } from "../../state/ViewSideContext";

function Probe() {
  const view = useContext(ViewSideContext);
  const { setActingSide } = useImpersonation();
  return (
    <div>
      <span data-testid="view">{view ?? "none"}</span>
      <button onClick={() => setActingSide("b")}>impersonate b</button>
    </div>
  );
}

test("setActingSide drives ViewSideContext; default is undefined", async () => {
  const user = userEvent.setup();
  render(<ImpersonationProvider><Probe /></ImpersonationProvider>);
  expect(screen.getByTestId("view")).toHaveTextContent("none");
  await user.click(screen.getByRole("button", { name: /impersonate b/i }));
  expect(screen.getByTestId("view")).toHaveTextContent("b");
});
