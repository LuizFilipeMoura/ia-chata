export interface RigCommand {
  verb: string;
  attrs: Record<string, string>;
}

const RIG_TAG_RE = /\[\[RIG\b([^\]]*?)\]\]/gi;

function parseAttrs(body: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /(\w+)\s*=\s*"([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) attrs[m[1].toLowerCase()] = m[2];
  return attrs;
}

/** Parse every [[RIG ...]] command out of `text`. Pure — the caller dispatches. */
export function parseRigCommands(text: string): RigCommand[] {
  RIG_TAG_RE.lastIndex = 0;
  const out: RigCommand[] = [];
  let match: RegExpExecArray | null;
  while ((match = RIG_TAG_RE.exec(text))) {
    const body = match[1].trim();
    const verb = (body.split(/\s+/)[0] || "").toLowerCase();
    out.push({ verb, attrs: parseAttrs(body) });
  }
  return out;
}

/** Remove command tags (and any trailing half-streamed tag) for display + speech. */
export function stripRigTags(text: string): string {
  return text
    .replace(RIG_TAG_RE, "")
    .replace(/\[\[RIG\b[^\]]*$/i, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
