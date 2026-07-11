import { expect, test } from "vitest";

const css = import.meta.glob("./styles/*.css", { query: "?raw", import: "default", eager: true }) as Record<string, string>;

// V2 has ONE type scale (styles/type.css). Every font-size in every other V2
// stylesheet must reference a --v2-text-* var — never a raw px/rem/em value.
// This keeps sizing on the common scale and enforces the 12px mobile floor.
test("no V2 stylesheet sets a raw font-size (must use var(--v2-text-*))", () => {
  const offenders: string[] = [];
  for (const [path, src] of Object.entries(css)) {
    if (path.endsWith("/type.css")) continue; // the scale itself defines the vars
    src.split("\n").forEach((line, i) => {
      const m = /font-size\s*:\s*([^;]+)/i.exec(line);
      // Allow a scale var, or `inherit` (defers to a scale-sized ancestor).
      if (m && !/var\(--v2-text-|inherit/.test(m[1])) offenders.push(`${path}:${i + 1} ${line.trim()}`);
    });
  }
  expect(offenders, `Use a .v2-text-* class or var(--v2-text-*):\n${offenders.join("\n")}`).toEqual([]);
});
