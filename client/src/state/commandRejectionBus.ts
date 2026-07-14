// A tiny event bus so the low-level command dispatcher (useCommands) can report a
// server rejection — a 409 "command not applied" carrying a per-rule reason —
// without knowing anything about the UI. A surface (e.g. the V2 rejection dialog)
// subscribes and decides how to show it. Kept framework-free and outside any
// feature folder so both the shared hook and V2 can depend on it.
type Listener = (reason: string) => void;

const listeners = new Set<Listener>();

export function onCommandRejected(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function emitCommandRejected(reason: string): void {
  for (const fn of listeners) fn(reason);
}
