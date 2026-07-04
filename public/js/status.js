const statusRow = document.getElementById("statusRow");

// Single-line status readout in the dock (Listening…, Answering…, errors).
export function setStatus(text) {
  statusRow.textContent = text || "";
}
