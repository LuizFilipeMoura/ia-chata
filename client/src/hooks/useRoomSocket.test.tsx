import { render, act } from "@testing-library/react";
import { useRoomSocket } from "./useRoomSocket";

class FakeWS {
  static last: FakeWS | null = null;
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  close = vi.fn(() => this.onclose?.());
  constructor(public url: string) { FakeWS.last = this; }
}

function Harness({ onState }: { onState: (s: unknown) => void }) {
  useRoomSocket({ room: "IRON42", side: "a" }, onState);
  return null;
}

test("dispatches parsed server state on message", () => {
  vi.stubGlobal("WebSocket", FakeWS as unknown as typeof WebSocket);
  const onState = vi.fn();
  render(<Harness onState={onState} />);
  act(() => {
    FakeWS.last!.onmessage!({ data: JSON.stringify({ version: 2, state: { version: 2, rigs: [], game: null } }) });
  });
  expect(onState).toHaveBeenCalledWith({ version: 2, rigs: [], game: null });
});

test("closes the socket on unmount", () => {
  vi.stubGlobal("WebSocket", FakeWS as unknown as typeof WebSocket);
  const { unmount } = render(<Harness onState={() => {}} />);
  const ws = FakeWS.last!;
  unmount();
  expect(ws.close).toHaveBeenCalled();
});
