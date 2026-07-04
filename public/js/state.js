// Central mutable client state, shared across modules via one live-bound object.
// No DOM, no fetch — just the data mirror of the server room plus helpers.
export const LOCS = ["hull", "arms", "legs", "engine"];

export const S = {
  rigs: [],          // mirror of server state.rigs
  game: null,        // mirror of server state.game
  stateVersion: -1,  // last version we rendered
  session: null,     // { room, side, name }
};

const SESSION_KEY = "ooi-session-v1";
try { S.session = JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); } catch { S.session = null; }

export function setSession(session) {
  S.session = session;
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

// The tracker registers its renderer here; applyServerState triggers it after
// adopting new state, so state.js never needs to import the DOM layer.
let onChange = () => {};
export function onServerStateChange(fn) { onChange = fn; }

export function applyServerState(state) {
  if (!state) return;
  S.rigs = Array.isArray(state.rigs) ? state.rigs : [];
  S.game = state.game || null;
  S.stateVersion = state.version ?? S.stateVersion;
  onChange();
}

export function findRig(name) {
  if (!name) return null;
  const n = String(name).trim().toLowerCase();
  return S.rigs.find((r) => r.name.toLowerCase() === n) || null;
}
