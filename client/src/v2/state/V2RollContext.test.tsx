import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import { useEffect } from "react";
import { V2RollProvider, useV2Roll } from "./V2RollContext";

function Prompt({ onResult }: { onResult: (v: Record<string, number>) => void }) {
  const { promptDice } = useV2Roll();
  useEffect(() => { promptDice([{ key: "d", label: "Overheat D12", sides: 12 }], "Overheat").then(onResult); }, [promptDice, onResult]);
  return null;
}
test("promptDice collects a manual die and resolves", async () => {
  const user = userEvent.setup();
  let result: Record<string, number> | null = null;
  render(<V2RollProvider><Prompt onResult={(v) => (result = v)} /></V2RollProvider>);
  const input = await screen.findByLabelText(/Overheat D12/i);
  await user.clear(input); await user.type(input, "10");
  await user.click(screen.getByRole("button", { name: /confirm|roll|submit|ok/i }));
  await new Promise((r) => setTimeout(r, 0));
  expect(result).toEqual({ d: 10 });
});
