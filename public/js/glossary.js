import { GLOSSARY } from "/shared/glossary.js";

// Every literal string that should be recognised, mapped back to its entry.
// Longest-first so "Heat Capacity" wins over the "Heat" it contains.
const byMatch = new Map();
for (const entry of GLOSSARY) {
  for (const m of entry.match) byMatch.set(m, entry);
}
const alternatives = [...byMatch.keys()].sort((a, b) => b.length - a.length);

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const pattern = new RegExp(`\\b(${alternatives.map(escapeRegExp).join("|")})\\b`, "g");

// Terms already inside these (or inside a previously-tagged term) are left alone.
const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "CODE", "PRE", "A"]);

function shouldSkip(node, root) {
  let el = node.parentElement;
  while (el && el !== root) {
    if (SKIP_TAGS.has(el.tagName) || el.classList?.contains("glossary-term")) return true;
    el = el.parentElement;
  }
  return false;
}

// Wrap every glossary term found in `root`'s text with a tappable span.
// Safe to call once on a fully-rendered chunk of markdown/plain text; do not
// call repeatedly on the same subtree (it would double-wrap already-tagged spans).
export function highlightGlossary(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  let n;
  while ((n = walker.nextNode())) {
    if (!shouldSkip(n, root)) nodes.push(n);
  }

  for (const node of nodes) {
    const text = node.nodeValue;
    pattern.lastIndex = 0;
    if (!pattern.test(text)) continue;

    pattern.lastIndex = 0;
    const frag = document.createDocumentFragment();
    let last = 0;
    let match;
    while ((match = pattern.exec(text))) {
      if (match.index > last) frag.appendChild(document.createTextNode(text.slice(last, match.index)));
      const entry = byMatch.get(match[0]);
      const mark = document.createElement("span");
      mark.className = "glossary-term";
      mark.textContent = match[0];
      mark.dataset.term = entry.id;
      mark.setAttribute("role", "button");
      mark.setAttribute("tabindex", "0");
      mark.setAttribute("aria-label", `${entry.term} — glossary term`);
      frag.appendChild(mark);
      last = match.index + match[0].length;
    }
    if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
    node.parentNode.replaceChild(frag, node);
  }
}
