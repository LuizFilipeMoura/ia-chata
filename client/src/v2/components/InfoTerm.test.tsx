import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import { V2GlossaryTipProvider } from "../state/V2GlossaryTipContext";
import { InfoTerm } from "./InfoTerm";

function wrap(node: React.ReactNode) {
  return render(<V2GlossaryTipProvider>{node}</V2GlossaryTipProvider>);
}

test("a known id renders an interactive control", () => {
  wrap(<InfoTerm id="burning">Burning 3</InfoTerm>);
  const el = screen.getByText("Burning 3");
  expect(el).toHaveAttribute("role", "button");
  expect(el).toHaveAttribute("tabindex", "0");
  expect(el).toHaveAttribute("data-info", "burning");
  expect(el.className).toContain("v2-info");
});

test("an unknown or absent id renders plain text with no affordance", () => {
  wrap(<InfoTerm id="does-not-exist">Mystery</InfoTerm>);
  const el = screen.getByText("Mystery");
  expect(el).not.toHaveAttribute("role");
  expect(el.className).not.toContain("v2-info");
});

test("clicking a known term opens its definition tip", async () => {
  const user = userEvent.setup();
  wrap(<InfoTerm id="burning">Burning 3</InfoTerm>);
  await user.click(screen.getByText("Burning 3"));
  // GlossaryTip renders role="tooltip" with the entry def text.
  expect(await screen.findByText(/On fire/i)).toBeInTheDocument();
});

test("keeps the host className alongside v2-info", () => {
  wrap(<InfoTerm id="burning" className="v2-rt-mod">Burning 3</InfoTerm>);
  const el = screen.getByText("Burning 3");
  expect(el.className).toContain("v2-info");
  expect(el.className).toContain("v2-rt-mod");
});

test("forwards data-tone to the host element", () => {
  wrap(<InfoTerm id="burning" className="v2-rt-mod" dataTone="crit">Burning 3</InfoTerm>);
  expect(screen.getByText("Burning 3")).toHaveAttribute("data-tone", "crit");
});
