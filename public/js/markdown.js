function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sanitizeHref(href) {
  const trimmed = String(href).trim();
  const compact = trimmed.replace(/[\u0000-\u001F\u007F\s]+/g, "");
  if (!compact) return "#";
  if (/^(https?:|mailto:|#|\/)/i.test(compact)) return compact;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(compact) && !compact.startsWith("//")) return compact;
  return "#";
}

function stashToken(tokens, html) {
  const key = `\u0000${tokens.length}\u0000`;
  tokens.push(html);
  return key;
}

function renderInline(source) {
  const tokens = [];
  let text = String(source);

  text = text.replace(/`([^`\n]+)`/g, (_, code) => (
    stashToken(tokens, `<code>${escapeHtml(code)}</code>`)
  ));

  text = text.replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, (_, label, href) => (
    stashToken(tokens, `<a href="${escapeHtml(sanitizeHref(href))}">${renderInline(label)}</a>`)
  ));

  let html = escapeHtml(text);
  html = html.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/__([^_\n]+)__/g, "<strong>$1</strong>");
  html = html.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  html = html.replace(/(^|[^_])_([^_\n]+)_/g, "$1<em>$2</em>");

  return html.replace(/\u0000(\d+)\u0000/g, (_, index) => tokens[Number(index)] ?? "");
}

function isBlockStart(line) {
  return /^(#{1,6}\s+|[-*+]\s+|\d+[.)]\s+|>\s+|```)/.test(line);
}

export function markdownToHtml(markdown) {
  const lines = String(markdown || "").replace(/\r\n?/g, "\n").split("\n");
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i += 1;
      continue;
    }

    const fence = line.match(/^```/);
    if (fence) {
      i += 1;
      const code = [];
      while (i < lines.length && !/^```/.test(lines[i])) {
        code.push(lines[i]);
        i += 1;
      }
      if (i < lines.length) i += 1;
      blocks.push(`<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`);
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      blocks.push(`<h${level}>${renderInline(heading[2].trim())}</h${level}>`);
      i += 1;
      continue;
    }

    if (/^[-*+]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^[-*+]\s+/.test(lines[i])) {
        items.push(`<li>${renderInline(lines[i].replace(/^[-*+]\s+/, ""))}</li>`);
        i += 1;
      }
      blocks.push(`<ul>${items.join("")}</ul>`);
      continue;
    }

    if (/^\d+[.)]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\d+[.)]\s+/.test(lines[i])) {
        items.push(`<li>${renderInline(lines[i].replace(/^\d+[.)]\s+/, ""))}</li>`);
        i += 1;
      }
      blocks.push(`<ol>${items.join("")}</ol>`);
      continue;
    }

    if (/^>\s+/.test(line)) {
      const quote = [];
      while (i < lines.length && /^>\s+/.test(lines[i])) {
        quote.push(lines[i].replace(/^>\s+/, ""));
        i += 1;
      }
      blocks.push(`<blockquote>${renderInline(quote.join("\n")).replace(/\n/g, "<br>")}</blockquote>`);
      continue;
    }

    const paragraph = [];
    while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i])) {
      paragraph.push(lines[i]);
      i += 1;
    }
    blocks.push(`<p>${renderInline(paragraph.join("\n")).replace(/\n/g, "<br>")}</p>`);
  }

  return blocks.join("");
}

export function renderMarkdown(element, markdown) {
  element.innerHTML = markdownToHtml(markdown);
}
