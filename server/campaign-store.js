import fs from "node:fs";
import path from "node:path";
import { newProfile } from "../shared/campaign/index.js";

// The single-player campaign save: one HQ profile, at most one live run, and
// the last finished run's summary for the end screen. One JSON file.
export function createCampaignStore(filePath) {
  let state = { profile: newProfile(), run: null, last: null };
  try {
    const saved = JSON.parse(fs.readFileSync(filePath, "utf8"));
    state = { ...state, ...saved, profile: { ...newProfile(), ...saved.profile } };
  } catch {
    // No save yet, start fresh.
  }
  return {
    get: () => state,
    save(next) {
      state = next;
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, JSON.stringify(state));
      return state;
    },
  };
}
