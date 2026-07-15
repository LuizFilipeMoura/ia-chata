import { render } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import RepairBody from "./RepairBody";

const noop = () => {};

describe("RepairBody copy reflects repair bonus", () => {
  it("no suite: 1/2/3 SP D6 roll", () => {
    render(<RepairBody isPatch={false} auto bonusSp={0} onChange={noop} />);
    expect(document.body.textContent).toContain("1–2 restores 1 SP");
    expect(document.body.textContent).toContain("3–4 restores 2 SP");
    expect(document.body.textContent).toContain("5–6 restores 3 SP");
  });
  it("+1 suite: 2/3/4 SP roll", () => {
    render(<RepairBody isPatch={false} auto bonusSp={1} onChange={noop} />);
    expect(document.body.textContent).toContain("1–2 restores 2 SP");
    expect(document.body.textContent).toContain("3–4 restores 3 SP");
    expect(document.body.textContent).toContain("5–6 restores 4 SP");
  });
  it("patch is a flat guaranteed 4 SP even with a suite bonus", () => {
    render(<RepairBody isPatch bonusSp={1} auto={false} onChange={noop} />);
    expect(document.body.textContent).toContain("guaranteed 4 SP");
  });
});
