import { S, applyServerState } from "./state.js";

// POST one mutation to the server, then adopt the authoritative result.
export async function sendCommand(verb, attrs) {
  if (!S.session?.room) return;
  try {
    const resp = await fetch(`/api/game/${encodeURIComponent(S.session.room)}/command`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cmd: { verb, attrs }, side: S.session?.side }),
    });
    if (!resp.ok) return;
    const { version, state } = await resp.json();
    if (version !== S.stateVersion) applyServerState(state);
  } catch { /* next poll will reconcile */ }
}

let pollTimer = null;

async function pollOnce() {
  if (!S.session?.room) return;
  try {
    const params = new URLSearchParams();
    if (S.session?.side) params.set("side", S.session.side);
    const qs = params.toString();
    const resp = await fetch(`/api/game/${encodeURIComponent(S.session.room)}${qs ? `?${qs}` : ""}`);
    if (!resp.ok) return;
    const { version, state } = await resp.json();
    if (version !== S.stateVersion) applyServerState(state);   // re-render only on change
  } catch { /* transient network error; next tick retries */ }
}

export function startPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollOnce();
  pollTimer = setInterval(pollOnce, 3000);
}
