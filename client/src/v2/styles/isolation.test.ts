import { expect, test } from "vitest";

// V2's whole isolation guarantee is that every rule lives under `.v2-root`, so
// nothing can leak into V1's global stylesheet. A bare `:root`, `html`, or
// `body` selector at the start of a rule would break that. This guards it by
// reading every V2 stylesheet as raw text (via Vite's glob import — no node fs,
// so it stays typed under the client tsconfig).
const sheets = import.meta.glob("./*.css", { query: "?raw", import: "default", eager: true }) as Record<string, string>;

test("every V2 stylesheet scopes all rules under .v2-root (no global selectors)", () => {
  const entries = Object.entries(sheets);
  expect(entries.length).toBeGreaterThan(0);

  const offenders: string[] = [];
  for (const [path, css] of entries) {
    css.split("\n").forEach((line, i) => {
      const trimmed = line.trim();
      if (/^(:root|html|body)[\s.,:{>+~]/.test(trimmed) || /^(:root|html|body)$/.test(trimmed)) {
        offenders.push(`${path}:${i + 1}  ${trimmed}`);
      }
    });
  }

  expect(offenders, `Global selectors found:\n${offenders.join("\n")}`).toEqual([]);
});
