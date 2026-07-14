import { render } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import RepairBody from "./RepairBody";

const noop = () => {};

describe("RepairBody copy reflects repair bonus", () => {
  it("no suite: 2/1 SP roll, 2 SP patch", () => {
    render(<RepairBody isPatch={false} auto bonusSp={0} onChange={noop} />);
    expect(document.body.textContent).toContain("10+ restores 2 SP");
    expect(document.body.textContent).toContain("7–9 restores 1 SP");
  });
  it("+1 suite: 3/2 SP roll", () => {
    render(<RepairBody isPatch={false} auto bonusSp={1} onChange={noop} />);
    expect(document.body.textContent).toContain("10+ restores 3 SP");
    expect(document.body.textContent).toContain("7–9 restores 2 SP");
  });
  it("+1 suite patch: guaranteed 3 SP", () => {
    render(<RepairBody isPatch bonusSp={1} auto={false} onChange={noop} />);
    expect(document.body.textContent).toContain("guaranteed 3 SP");
  });
});
