// Thin client for the rules server: the same /api/game room protocol the V2 app
// speaks (join → commands → WS pushes), plus the /api/sim balance lab.
async function req(method, url, body) {
  const r = await fetch(url, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(data.reason || data.error || r.statusText); e.data = data; e.status = r.status; throw e; }
  return data;
}

export const api = {
  join: (room, side, name = "Commander") => req("POST", `/api/game/${room}/join`, { side, name }),
  state: (room, side) => req("GET", `/api/game/${room}?side=${side}`),
  command: (room, side, verb, attrs = {}) => req("POST", `/api/game/${room}/command`, { cmd: { verb, attrs }, side }),
  check: (room, side, verb, attrs = {}) => req("POST", `/api/game/${room}/command/check`, { cmd: { verb, attrs }, side }),
  chassis: () => req("GET", "/api/chassis"),
  sim: {
    evolve: (params) => req("POST", "/api/sim/evolve", params),
    job: (id) => req("GET", `/api/sim/jobs/${id}`),
    jobs: () => req("GET", "/api/sim/jobs"),
    stop: (id) => req("POST", `/api/sim/jobs/${id}/stop`),
    rooms: (body) => req("POST", "/api/sim/rooms", body),
    batch: (id) => req("GET", `/api/sim/rooms/${id}`),
    replays: (q = {}) => req("GET", `/api/sim/replays?${new URLSearchParams(Object.entries(q).filter(([, v]) => v != null && v !== ""))}`),
    replay: (id) => req("GET", `/api/sim/replays/${id}`),
    deleteReplay: (id) => req("DELETE", `/api/sim/replays/${id}`),
    adopt: (id) => req("POST", `/api/sim/jobs/${id}/adopt`),
    calibrate: (body) => req("POST", "/api/sim/calibrate", body),
    match: (body) => req("POST", "/api/sim/match", body),
    meta: () => req("GET", "/api/sim/meta"),
  },
};

// Live room socket; calls onState(state) for every push. Auto-reconnects.
export function connect(room, side, onState) {
  let ws, closed = false, retry = 500;
  const open = () => {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    ws = new WebSocket(`${proto}://${location.host}/ws?room=${encodeURIComponent(room)}&side=${side}`);
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        const state = msg.state || msg;
        if (state?.game) onState(state);
      } catch {}
    };
    ws.onopen = () => { retry = 500; };
    ws.onclose = () => { if (!closed) setTimeout(open, (retry = Math.min(8000, retry * 2))); };
  };
  open();
  return () => { closed = true; ws?.close(); };
}
