import { describe, it, expect } from "vitest";
import { buildSeedCommands } from "./seed";

describe("buildSeedCommands", () => {
  const cmds = buildSeedCommands();

  it("adds 3 rigs for each side", () => {
    const adds = cmds.filter((c) => c.verb === "add");
    expect(adds.filter((c) => c.side === "a")).toHaveLength(3);
    expect(adds.filter((c) => c.side === "b")).toHaveLength(3);
    // Seed rigs are random chassis now — each carries a chassis id and a
    // supported weight class.
    expect(adds.every((c) => typeof c.attrs.chassis === "string")).toBe(true);
    expect(adds.every((c) => ["light", "medium"].includes(c.attrs.class as string))).toBe(true);
  });

  it("locks the field as side a (the owner) after adds, before ready", () => {
    const lockIdx = cmds.findIndex((c) => c.verb === "field" && c.attrs.action === "lock");
    const firstReadyIdx = cmds.findIndex((c) => c.verb === "ready");
    const lastAddIdx = cmds.map((c) => c.verb).lastIndexOf("add");
    expect(cmds[lockIdx].side).toBe("a");
    expect(lockIdx).toBeGreaterThan(lastAddIdx);
    expect(lockIdx).toBeLessThan(firstReadyIdx);
  });

  it("readies both sides last", () => {
    const readies = cmds.filter((c) => c.verb === "ready");
    expect(readies.map((c) => c.side).sort()).toEqual(["a", "b"]);
  });
});
