import { S, setSession, applyServerState } from "./state.js";
import { startSocket } from "./api.js";

const joinGate = document.getElementById("joinGate");
const joinRoom = document.getElementById("joinRoom");
const joinName = document.getElementById("joinName");
const joinBtn = document.getElementById("joinBtn");
const joinErr = document.getElementById("joinErr");
const joinHint = document.getElementById("joinHint");
let chosenSide = null;

export function showGate() {
  joinGate.classList.remove("hidden");
}

// Reactive gate: the Enter button stays disabled until the player has a room
// code and a side, and the hint always names the one thing still missing.
function updateJoinReady() {
  const room = joinRoom.value.trim();
  const missing = !room ? "Enter a room code."
    : !joinName.value.trim() ? "Enter your name."
    : !chosenSide ? "Pick a side to continue."
    : "";
  joinBtn.disabled = Boolean(!room || !chosenSide);
  if (joinHint) {
    joinHint.textContent = missing || "Ready — tap Enter room.";
    joinHint.classList.toggle("join-hint--go", !missing);
  }
}

document.querySelectorAll(".join-side").forEach((b) => {
  b.addEventListener("click", () => {
    chosenSide = b.dataset.side;
    document.querySelectorAll(".join-side").forEach((x) => x.classList.toggle("active", x === b));
    updateJoinReady();
  });
});

joinRoom.addEventListener("input", updateJoinReady);
joinName.addEventListener("input", updateJoinReady);
updateJoinReady();

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
  startSocket();
}

joinBtn.addEventListener("click", async () => {
  const room = joinRoom.value.trim().toUpperCase();
  const name = joinName.value.trim() || "Player";
  joinErr.textContent = "";
  if (!room) { joinErr.textContent = "Enter a room code."; return; }
  try { await joinRoomFlow(room, name, chosenSide); }
  catch (e) { joinErr.textContent = e.message; }
});
