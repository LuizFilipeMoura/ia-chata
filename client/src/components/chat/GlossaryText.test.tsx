import { render } from "@testing-library/react";
import { GlossaryText } from "./GlossaryText";
import { GlossaryTipProvider } from "../../state/GlossaryTipContext";
import { tokenizeGlossary } from "../../lib/glossaryTerms";

test("wraps recognized glossary terms in tappable spans", () => {
  const sample = tokenizeGlossary("Heat").find((s) => s.kind === "term")?.text ?? "Heat";
  const { container } = render(
    <GlossaryTipProvider>
      <GlossaryText text={`Watch the ${sample}.`} />
    </GlossaryTipProvider>,
  );
  const term = container.querySelector(".glossary-term");
  expect(term).not.toBeNull();
  expect(term).toHaveAttribute("data-term");
  expect(term).toHaveAttribute("role", "button");
});
