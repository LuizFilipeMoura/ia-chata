import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { AppProviders } from "../../AppProviders";
import { V2GlossaryTipProvider } from "../state/V2GlossaryTipContext";
import { V2ChatMount } from "./V2ChatMount";

test("renders the Quartermaster chat panel", async () => {
  render(<AppProviders><V2GlossaryTipProvider><V2ChatMount /></V2GlossaryTipProvider></AppProviders>);
  // ChatPanel renders both a "Rulebook Assistant" title and a greeting bubble
  // mentioning the rulebook, so match the greeting specifically to stay unambiguous.
  expect(await screen.findByText(/anything about the .+ rulebook/i)).toBeInTheDocument();
});
