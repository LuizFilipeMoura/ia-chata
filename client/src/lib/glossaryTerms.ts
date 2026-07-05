import { GLOSSARY } from "/shared/glossary.js";

export interface GlossaryEntry { id: string; term: string; def: string; match: string[] }
export interface Segment { kind: "text" | "term"; text: string; id?: string; term?: string }

const byMatch = new Map<string, GlossaryEntry>();
for (const entry of GLOSSARY) for (const m of entry.match) byMatch.set(m, entry);
const byId = new Map(GLOSSARY.map((e) => [e.id, e]));

const alternatives = [...byMatch.keys()].sort((a, b) => b.length - a.length);
function escapeRegExp(s: string) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
const pattern = new RegExp(`\\b(${alternatives.map(escapeRegExp).join("|")})\\b`, "g");

export function glossaryById(id: string): GlossaryEntry | undefined { return byId.get(id); }

/** Split plain text into text/term segments; concatenating .text yields the input. */
export function tokenizeGlossary(text: string): Segment[] {
  const segs: Segment[] = [];
  pattern.lastIndex = 0;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(text))) {
    if (m.index > last) segs.push({ kind: "text", text: text.slice(last, m.index) });
    const entry = byMatch.get(m[0])!;
    segs.push({ kind: "term", text: m[0], id: entry.id, term: entry.term });
    last = m.index + m[0].length;
  }
  if (last < text.length) segs.push({ kind: "text", text: text.slice(last) });
  return segs;
}
