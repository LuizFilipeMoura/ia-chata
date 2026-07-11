import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { V2DrawerProvider, useV2Drawer } from "./V2DrawerContext";

function Opener({ onClose }: { onClose: () => void }) {
  const { openDrawer } = useV2Drawer();
  return <button onClick={() => openDrawer({ title: "Move", render: () => <p>body</p>,
    actions: [{ label: "Go", primary: true, onClick: onClose }] })}>open</button>;
}
test("opens a drawer with title/body/action and fires the action", async () => {
  const user = userEvent.setup();
  const onClose = vi.fn();
  render(<V2DrawerProvider><Opener onClose={onClose} /></V2DrawerProvider>);
  await user.click(screen.getByText("open"));
  expect(await screen.findByText("Move")).toBeInTheDocument();
  expect(screen.getByText("body")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Go" }));
  expect(onClose).toHaveBeenCalled();
});
