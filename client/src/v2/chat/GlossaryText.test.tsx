import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { V2GlossaryTipProvider } from "../state/V2GlossaryTipContext";
import { GlossaryText } from "./GlossaryText";

// "Ironclad" is a real term in /shared/glossary.js (id "ironclad").
const SAMPLE = "The Ironclad climbed into the cockpit before the battle.";
const TERM_RE = /Ironclad/;

test("wraps a known glossary term in a tappable control", () => {
  render(
    <V2GlossaryTipProvider>
      <GlossaryText text={SAMPLE} />
    </V2GlossaryTipProvider>,
  );
  const el = screen.getByText(TERM_RE);
  expect(el).toBeInTheDocument();
  // The highlighted term is an interactive control, not inert text.
  expect(el).toHaveAttribute("role", "button");
  expect(el).toHaveAttribute("tabindex", "0");
  expect(el).toHaveAttribute("data-term", "ironclad");
});
