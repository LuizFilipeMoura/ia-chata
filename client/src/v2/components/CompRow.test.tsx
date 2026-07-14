import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { V2GlossaryTipProvider } from "../state/V2GlossaryTipContext";
import { CompRow } from "./CompRow";

function wrap(node: React.ReactNode) {
  return render(<V2GlossaryTipProvider>{node}</V2GlossaryTipProvider>);
}

test("damage and repair dispatch the right commands", async () => {
  const user = userEvent.setup();
  const onCommand = vi.fn();
  wrap(<CompRow rigName="STALKER" loc="hull" comp={{ sp: 4, max: 6, destroyed: false }} onCommand={onCommand} />);
  await user.click(screen.getByRole("button", { name: /Damage hull/i }));
  expect(onCommand).toHaveBeenCalledWith("damage", { name: "STALKER", loc: "hull", amount: "1" });
  await user.click(screen.getByRole("button", { name: /Repair hull/i }));
  expect(onCommand).toHaveBeenCalledWith("repair", { name: "STALKER", loc: "hull", amount: "1" });
});

test("shows CATASTROPHIC at 0 SP", () => {
  wrap(<CompRow rigName="X" loc="legs" comp={{ sp: 0, max: 5, destroyed: false }} onCommand={vi.fn()} />);
  expect(screen.getByText("CATASTROPHIC")).toBeInTheDocument();
});

test("renders a +N max-SP badge when delta > 0", () => {
  wrap(<CompRow rigName="Vela" loc="hull" comp={{ sp: 7, max: 7, destroyed: false }} delta={1} onCommand={vi.fn()} />);
  expect(document.body.textContent).toContain("+1");
});

test("renders no badge when delta is 0", () => {
  const { container } = wrap(<CompRow rigName="Vela" loc="arms" comp={{ sp: 5, max: 5, destroyed: false }} delta={0} onCommand={vi.fn()} />);
  expect(container.querySelector(".v2-rt-delta")).toBeNull();
});
