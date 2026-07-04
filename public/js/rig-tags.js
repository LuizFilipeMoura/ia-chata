import { sendCommand } from "./api.js";

// ---- Command protocol: [[RIG verb attr="v" ...]] ----
const RIG_TAG_RE = /\[\[RIG\b([^\]]*?)\]\]/gi;

function parseAttrs(body) {
  const attrs = {};
  const re = /(\w+)\s*=\s*"([^"]*)"/g;
  let m;
  while ((m = re.exec(body))) attrs[m[1].toLowerCase()] = m[2];
  return attrs;
}

// Parse every [[RIG ...]] command out of `text` and POST each to the server.
export function applyRigCommands(text) {
  RIG_TAG_RE.lastIndex = 0;
  let match;
  while ((match = RIG_TAG_RE.exec(text))) {
    const body = match[1].trim();
    const verb = (body.split(/\s+/)[0] || "").toLowerCase();
    const a = parseAttrs(body);   // { name, loc, amount, ... } — verb word is not an attr
    sendCommand(verb, a);
  }
}

// Remove command tags (and any trailing half-streamed tag) for display + speech.
export function stripRigTags(text) {
  return text
    .replace(RIG_TAG_RE, "")
    .replace(/\[\[RIG\b[^\]]*$/i, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
