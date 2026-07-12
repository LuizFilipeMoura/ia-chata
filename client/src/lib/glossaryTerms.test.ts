import { tokenizeGlossary, glossaryById, matchGlossary } from "./glossaryTerms";

test("tokenizeGlossary splits recognized terms into term segments", () => {
  const segs = tokenizeGlossary("Watch the Heat and the Hull.");
  const terms = segs.filter((s) => s.kind === "term").map((s) => s.text);
  expect(terms).toContain("Heat");
  expect(terms).toContain("Hull");
  const rejoined = segs.map((s) => s.text).join("");
  expect(rejoined).toBe("Watch the Heat and the Hull.");
});

test("glossaryById resolves a term entry", () => {
  const anyId = tokenizeGlossary("Heat").find((s) => s.kind === "term")!.id!;
  expect(glossaryById(anyId)?.term).toBeTruthy();
});

test("matchGlossary maps an exact match string to its glossary id", () => {
  expect(matchGlossary("Full Auto")).toBe("full-auto");
  expect(matchGlossary("Hull")).toBe("hull");
});

test("matchGlossary returns undefined for an unknown string", () => {
  expect(matchGlossary("Nonexistent Perk")).toBeUndefined();
});

test("includes the Answer counters", () => {
  for (const id of ["riposte", "sidestep", "exploit"]) {
    expect(glossaryById(id)).toBeTruthy();
  }
});
