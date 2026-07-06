import type { Session } from "./types";

const SESSION_KEY = "ooi-session-v1";

export function loadSession(): Session | null {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); }
  catch { return null; }
}
export function saveSession(session: Session): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}
export function clearSession(): void {
  localStorage.removeItem(SESSION_KEY);
}
