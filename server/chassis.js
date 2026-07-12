import fs from "node:fs";
import path from "node:path";
import { CHASSIS, EQUIPMENT } from "../shared/game-state.js";

// Editable content layered on top of the code-authoritative chassis registry.
// Weapons + weight class live in shared/game-state.js (they mirror the physical
// minis and drive server-side add enforcement), so the on-disk JSON can only
// change presentation: the label and these four authored fields. That keeps the
// file from ever inventing an illegal weapon combo.
const CONTENT_FIELDS = ["description", "focus", "balance", "personality"];

// Keep only well-formed suggestions pointing at a real equipment id; coerce
// reason to a string; cap at 2. Anything else (non-array, junk rows) → [].
function cleanSuggestions(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((s) => s && typeof s.id === "string" && EQUIPMENT[s.id])
    .map((s) => ({ id: s.id, reason: typeof s.reason === "string" ? s.reason : "" }))
    .slice(0, 2);
}

// Canonical entries with empty content, in registry order. The on-disk file is
// merged onto these by id; anything it omits falls back here.
function defaults() {
  return CHASSIS.map((p) => ({
    ...p,
    ...Object.fromEntries(CONTENT_FIELDS.map((f) => [f, ""])),
    suggestedEquipment: [],
  }));
}

// A store that loads content/chassis.json, hot-reloads it on change, and seeds
// it from the defaults when the file is missing. `all()`/`get()` return the
// effective, merged entries (used only for display — enforcement uses the shared
// registry directly).
export function createChassisStore(filePath) {
  let entries = defaults();

  function mergeFromDisk() {
    let onDisk;
    try {
      onDisk = JSON.parse(fs.readFileSync(filePath, "utf8"));
    } catch {
      return; // missing or malformed — keep last-known-good entries
    }
    if (!Array.isArray(onDisk)) return;
    const byId = new Map(defaults().map((d) => [d.id, d]));
    for (const row of onDisk) {
      const base = byId.get(row?.id);
      if (!base) continue; // unknown id — ignore, cannot introduce new combos
      byId.set(row.id, {
        ...base,
        label: typeof row.label === "string" && row.label.trim() ? row.label : base.label,
        ...Object.fromEntries(
          CONTENT_FIELDS.map((f) => [f, typeof row[f] === "string" ? row[f] : base[f]]),
        ),
        suggestedEquipment: "suggestedEquipment" in row
          ? cleanSuggestions(row.suggestedEquipment)
          : base.suggestedEquipment,
      });
    }
    entries = defaults().map((d) => byId.get(d.id));
  }

  function seedIfMissing() {
    if (fs.existsSync(filePath)) return;
    try {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, JSON.stringify(defaults(), null, 2) + "\n");
    } catch { /* read-only fs — fall back to in-memory defaults */ }
  }

  function watch() {
    try {
      // Editors write in bursts (truncate then write); re-read shortly after.
      fs.watch(filePath, { persistent: false }, () => setTimeout(mergeFromDisk, 50));
    } catch { /* watching is best-effort */ }
  }

  seedIfMissing();
  mergeFromDisk();
  watch();

  return {
    all: () => entries.map((e) => ({ ...e })),
    get: (id) => {
      const ref = String(id || "").trim().toLowerCase();
      return entries.find((e) => e.id === ref) || null;
    },
    reload: mergeFromDisk,
  };
}
