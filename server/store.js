import fs from "node:fs";
import path from "node:path";
import { createRoom } from "../shared/game-state.js";

export function createStore(filePath) {
  const rooms = new Map();

  function load() {
    try {
      const obj = JSON.parse(fs.readFileSync(filePath, "utf8"));
      for (const [code, room] of Object.entries(obj)) rooms.set(code, room);
    } catch {
      // No file yet, or unreadable — start empty.
    }
  }

  function persist() {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(Object.fromEntries(rooms)));
  }

  function getRoom(code) {
    return rooms.get(code) || null;
  }

  function getOrCreateRoom(code) {
    let room = rooms.get(code);
    if (!room) {
      room = createRoom(code);
      rooms.set(code, room);
      persist();
    }
    return room;
  }

  load();
  return { rooms, getRoom, getOrCreateRoom, persist };
}
