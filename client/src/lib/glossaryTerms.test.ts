import { tokenizeGlossary, glossaryById } from "./glossaryTerms";

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
