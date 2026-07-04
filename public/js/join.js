import { S, setSession, applyServerState } from "./state.js";
import { startPolling } from "./api.js";

const joinGate = document.getElementById("joinGate");
const joinRoom = document.getElementById("joinRoom");
const joinName = document.getElementById("joinName");
const joinBtn = document.getElementById("joinBtn");
const joinErr = document.getElementById("joinErr");
let chosenSide = null;

export function showGate() {
  joinGate.classList.remove("hidden");
}

document.querySelectorAll(".join-side").forEach((b) => {
  b.addEventListener("click", () => {
    chosenSide = b.dataset.side;
    document.querySelectorAll(".join-side").forEach((x) => x.classList.toggle("active", x === b));
  });
});

export async function joinRoomFlow(room, name, side) {
  const resp = await fetch(`/api/game/${encodeURIComponent(room)}/join`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, side }),
  });
  if (!resp.ok) throw new Error(`join failed (${resp.status})`);
  const data = await resp.json();
  if (!data.side) throw new Error("Room is full.");
  setSession({ room, side: data.side, name });
  applyServerState(data.state);
  joinGate.classList.add("hidden");
  startPolling();
}

joinBtn.addEventListener("click", async () => {
  const room = joinRoom.value.trim().toUpperCase();
  const name = joinName.value.trim() || "Player";
  joinErr.textContent = "";
  if (!room) { joinErr.textContent = "Enter a room code."; return; }
  try { await joinRoomFlow(room, name, chosenSide); }
  catch (e) { joinErr.textContent = e.message; }
});
