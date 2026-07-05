import { render, screen } from "@testing-library/react";
import { createRef } from "react";
import RollConsole, { type RollConsoleHandle } from "./RollConsole";

beforeAll(() => {
  if (!window.matchMedia) {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
  }
});

test("reaction resolution reveals the reaction label", async () => {
  const ref = createRef<RollConsoleHandle>();
  render(<RollConsole ref={ref} />);
  await ref.current!.playResolution({
    id: 1, kind: "reaction", prep: "return", summary: "R reveals Return Fire!", effects: [],
  });
  expect(await screen.findByLabelText("Return Fire")).toBeInTheDocument();
});
