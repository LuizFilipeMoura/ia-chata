import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { GlossaryDialog } from "./GlossaryDialog";

describe("GlossaryDialog", () => {
  it("renders glossary terms when open", () => {
    render(<GlossaryDialog open onClose={() => {}} />);
    expect(screen.getByText("Rig")).toBeInTheDocument();
    expect(screen.getByText("Ironclad")).toBeInTheDocument();
  });
  it("renders nothing when closed", () => {
    const { container } = render(<GlossaryDialog open={false} onClose={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });
});
